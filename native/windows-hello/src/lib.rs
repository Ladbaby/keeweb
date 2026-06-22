#[cfg(windows)]
mod platform;

#[cfg(not(windows))]
mod platform {
    use napi::bindgen_prelude::*;

    pub async fn is_available() -> Result<bool> {
        Ok(false)
    }

    pub async fn protect(_key_tag: String, _data: Buffer) -> Result<Buffer> {
        Err(Error::from_reason("Windows Hello requires Windows"))
    }

    pub async fn unprotect(_key_tag: String, _message: String, _data: Buffer) -> Result<Buffer> {
        Err(Error::from_reason("Windows Hello requires Windows"))
    }

    pub async fn delete_key(_key_tag: String) -> Result<()> {
        Err(Error::from_reason("Windows Hello requires Windows"))
    }
}

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Check if Windows Hello (biometric/PIN) is available on this device.
#[napi]
pub async fn is_available() -> Result<bool> {
    platform::is_available().await
}

/// Protect (encrypt) data using a Windows Hello-protected key.
#[napi]
pub async fn protect(key_tag: String, data: Buffer) -> Result<Buffer> {
    platform::protect(&key_tag, data).await
}

/// Unprotect (decrypt) data that was previously protected with `protect()`.
#[napi]
pub async fn unprotect(key_tag: String, message: String, data: Buffer) -> Result<Buffer> {
    platform::unprotect(&key_tag, &message, data).await
}

/// Delete the Windows Hello-protected key identified by key_tag.
#[napi]
pub async fn delete_key(key_tag: String) -> Result<()> {
    platform::delete_key(&key_tag).await
}
