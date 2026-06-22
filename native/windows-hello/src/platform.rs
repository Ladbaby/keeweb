#![cfg(windows)]

use std::sync::Mutex;
use std::time::Instant;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use napi::bindgen_prelude::*;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use windows::Security::Credentials::UI::{
    UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
};
use windows::Win32::Foundation::{HLOCAL, LocalFree};
use windows::Win32::Security::Cryptography::CRYPTPROTECT_UI_FORBIDDEN;

const KEY_TAG_PREFIX: &str = "KeeWeb_WH_";
const AES_NONCE_LEN: usize = 12;
const KEY_CACHE_TTL_SECS: u64 = 900;

lazy_static::lazy_static! {
    static ref KEY_CACHE: Mutex<std::collections::HashMap<String, (Vec<u8>, Instant)>> =
        Mutex::new(std::collections::HashMap::new());
}

// Win32 DATA_BLOB (matches _CRYPTOAPI_BLOB ABI)
#[repr(C)]
struct DataBlob {
    cb_data: u32,
    pb_data: *mut u8,
}

// Raw P/Invoke for DPAPI (crypt32.dll)
#[link(name = "crypt32")]
extern "system" {
    fn CryptProtectData(
        pDataIn: *const DataBlob,
        szDataDescr: *const u16,
        pOptionalEntropy: *const DataBlob,
        pvReserved: *const std::ffi::c_void,
        pPromptStruct: *const std::ffi::c_void,
        dwFlags: u32,
        pDataOut: *mut DataBlob,
    ) -> i32;

    fn CryptUnprotectData(
        pDataIn: *const DataBlob,
        szDataDescr: *mut *const u16,
        pOptionalEntropy: *const DataBlob,
        pvReserved: *const std::ffi::c_void,
        pPromptStruct: *const std::ffi::c_void,
        dwFlags: u32,
        pDataOut: *mut DataBlob,
    ) -> i32;
}

// Win32 CREDENTIAL struct (advapi32.dll)
#[repr(C)]
struct Credential {
    flags: u32,
    cred_type: u32,
    target_name: *const u16,
    comment: *const u16,
    last_written: i64,
    credential_blob_size: u32,
    credential_blob: *const u8,
    persistence: u32,
    attribute_count: u32,
    attributes: *const std::ffi::c_void,
    target_alias: *const u16,
    user_name: *const u16,
}

const CRED_TYPE_GENERIC: u32 = 1;
const CRED_PERSIST_CURRENT_USER: u32 = 2;

fn validate_key_tag(key_tag: &str) -> Result<()> {
    if key_tag.is_empty() {
        return Err(Error::from_reason("key_tag must not be empty"));
    }
    if key_tag.len() > 100 {
        return Err(Error::from_reason("key_tag too long"));
    }
    if !key_tag
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err(Error::from_reason(
            "key_tag contains invalid characters (allowlist: a-z, A-Z, 0-9, ., -, _)",
        ));
    }
    Ok(())
}

#[link(name = "advapi32")]
extern "system" {
    fn CredWriteW(credential: *const Credential, flags: u32) -> i32;
    fn CredReadW(
        target_name: *const u16,
        cred_type: u32,
        flags: u32,
        credential: *mut *mut Credential,
    ) -> i32;
    fn CredFree(credential: *mut Credential) -> i32;
    fn CredDeleteW(target_name: *const u16, cred_type: u32, flags: u32) -> i32;
}

pub async fn is_available() -> Result<bool> {
    let availability = UserConsentVerifier::CheckAvailabilityAsync()
        .map_err(|e| Error::from_reason(format!("Failed to check availability: {}", e)))?
        .await
        .map_err(|e| Error::from_reason(format!("Await failed: {}", e)))?;

    Ok(matches!(
        availability,
        UserConsentVerifierAvailability::Available
    ))
}

async fn authenticate(message: &str) -> Result<bool> {
    let result = UserConsentVerifier::RequestVerificationAsync(&message.into())
        .map_err(|e| Error::from_reason(format!("Failed to request verification: {}", e)))?
        .await
        .map_err(|e| Error::from_reason(format!("Await failed: {}", e)))?;

    Ok(result == UserConsentVerificationResult::Verified)
}

pub async fn protect(key_tag: &str, data: Buffer) -> Result<Buffer> {
    validate_key_tag(key_tag)?;
    if !authenticate("KeeWeb - authenticate to unlock password storage").await? {
        return Err(Error::from_reason("User refused"));
    }

    let key = get_or_create_key(key_tag).await?;

    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| Error::from_reason(format!("Invalid key: {}", e)))?;

    let mut nonce_bytes = [0u8; AES_NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_ref())
        .map_err(|e| Error::from_reason(format!("Encryption failed: {}", e)))?;

    let mut result = Vec::with_capacity(AES_NONCE_LEN + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result.into())
}

pub async fn unprotect(key_tag: &str, message: &str, data: Buffer) -> Result<Buffer> {
    validate_key_tag(key_tag)?;
    if !authenticate(message).await? {
        return Err(Error::from_reason("User refused"));
    }

    let key = get_or_create_key(key_tag).await?;

    if data.len() < AES_NONCE_LEN {
        return Err(Error::from_reason("Invalid encrypted data"));
    }

    let (nonce_bytes, ciphertext) = data.as_ref().split_at(AES_NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| Error::from_reason(format!("Invalid key: {}", e)))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| Error::from_reason(format!("Decryption failed: {}", e)))?;

    Ok(plaintext.into())
}

pub async fn delete_key(key_tag: &str) -> Result<()> {
    validate_key_tag(key_tag)?;
    KEY_CACHE.lock().unwrap().remove(key_tag);
    let vault_key = format!("{}{}", KEY_TAG_PREFIX, key_tag);
    delete_credential(&vault_key);
    Ok(())
}

async fn get_or_create_key(key_tag: &str) -> Result<Vec<u8>> {
    let vault_key = format!("{}{}", KEY_TAG_PREFIX, key_tag);

    {
        let mut cache = KEY_CACHE.lock().unwrap();
        if let Some((key, cached_at)) = cache.get(key_tag) {
            if cached_at.elapsed().as_secs() < KEY_CACHE_TTL_SECS {
                return Ok(key.clone());
            }
            cache.remove(key_tag);
        }
    }

    match load_credential(&vault_key) {
        Ok(Some(blob)) => {
            let key = dpapi_unprotect(&blob, &vault_key)?;
            KEY_CACHE.lock().unwrap().insert(key_tag.to_string(), (key.clone(), Instant::now()));
            Ok(key)
        }
        _ => {
            if !authenticate("KeeWeb - authenticate to create encryption key").await? {
                return Err(Error::from_reason("User refused authentication"));
            }

            let mut key = vec![0u8; 32];
            OsRng.fill_bytes(&mut key);

            let blob = dpapi_protect(&key, &vault_key)?;
            store_credential(&vault_key, &blob)?;

            KEY_CACHE.lock().unwrap().insert(key_tag.to_string(), (key.clone(), Instant::now()));
            Ok(key)
        }
    }
}

fn make_data_blob(data: &[u8]) -> DataBlob {
    DataBlob {
        cb_data: data.len().try_into().unwrap(),
        pb_data: data.as_ptr() as *mut u8,
    }
}

fn dpapi_protect(data: &[u8], entropy: &str) -> Result<Vec<u8>> {
    let entropy_bytes = Sha256::digest(entropy.as_bytes());
    let in_blob = make_data_blob(data);
    let entropy_blob = make_data_blob(&entropy_bytes);
    let mut out_blob = DataBlob { cb_data: 0, pb_data: std::ptr::null_mut() };

    unsafe {
        let ret = CryptProtectData(
            &in_blob,
            std::ptr::null(),
            &entropy_blob,
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        );
        if ret == 0 {
            return Err(Error::from_reason("DPAPI protect failed"));
        }
        let result = std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize).to_vec();
        let _ = LocalFree(HLOCAL(out_blob.pb_data as _));
        Ok(result)
    }
}

fn dpapi_unprotect(data: &[u8], entropy: &str) -> Result<Vec<u8>> {
    let entropy_bytes = Sha256::digest(entropy.as_bytes());
    let in_blob = make_data_blob(data);
    let entropy_blob = make_data_blob(&entropy_bytes);
    let mut out_blob = DataBlob { cb_data: 0, pb_data: std::ptr::null_mut() };

    unsafe {
        let ret = CryptUnprotectData(
            &in_blob,
            std::ptr::null_mut(),
            &entropy_blob,
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        );
        if ret == 0 {
            return Err(Error::from_reason("DPAPI unprotect failed"));
        }
        let result = std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize).to_vec();
        let _ = LocalFree(HLOCAL(out_blob.pb_data as _));
        Ok(result)
    }
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn store_credential(name: &str, data: &[u8]) -> Result<()> {
    let name_wide = to_wide(name);

    let cred = Credential {
        flags: 0,
        cred_type: CRED_TYPE_GENERIC,
        target_name: name_wide.as_ptr(),
        comment: std::ptr::null(),
        last_written: 0,
        credential_blob_size: data.len().try_into().unwrap(),
        credential_blob: data.as_ptr(),
        persistence: CRED_PERSIST_CURRENT_USER,
        attribute_count: 0,
        attributes: std::ptr::null(),
        target_alias: std::ptr::null(),
        user_name: std::ptr::null(),
    };

    unsafe {
        if CredWriteW(&cred, 0) == 0 {
            return Err(Error::from_reason("CredWriteW failed"));
        }
    }
    Ok(())
}

fn load_credential(name: &str) -> Result<Option<Vec<u8>>> {
    let name_wide = to_wide(name);

    unsafe {
        let mut p_cred: *mut Credential = std::ptr::null_mut();
        if CredReadW(name_wide.as_ptr(), CRED_TYPE_GENERIC, 0, &mut p_cred) == 0 {
            return Ok(None);
        }
        let cred = &*p_cred;
        let result =
            std::slice::from_raw_parts(cred.credential_blob, cred.credential_blob_size as usize)
                .to_vec();
        let _ = CredFree(p_cred as *mut Credential);
        Ok(Some(result))
    }
}

fn delete_credential(name: &str) {
    let name_wide = to_wide(name);
    unsafe {
        let _ = CredDeleteW(name_wide.as_ptr(), CRED_TYPE_GENERIC, 0);
    }
}
