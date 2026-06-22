# windows-hello

Native Node.js addon for Windows Hello biometric key protection, built with [napi-rs](https://napi.rs).

## Prerequisites

- Rust toolchain with `x86_64-pc-windows-msvc` target
- Node.js 18+
- Windows 10 1809+ or Windows 11

## Building

```bash
npm install
npx napi build --release --platform
```

This produces `windows-hello.win32-x64.node` (and `win32-x86` for 32-bit).

## Integration into keeweb-native-modules

To publish this crate as part of `@keeweb/keeweb-native-modules`:

1. Copy this crate into the keeweb-native-modules repository
2. Add it to the root `Cargo.toml` workspace members
3. Run the build script to produce the `.node` binaries
4. Publish the updated `@keeweb/keeweb-native-modules` npm package

The `.node` files must follow the naming convention:
`windows-hello-<platform>-<arch>.node`

Which are loaded by `desktop/scripts/util/req-native.js` in KeeWeb.

## API

- `isAvailable()` - Check if Windows Hello (biometric/PIN) is available
- `protect(keyTag, data)` - Encrypt data with a Windows Hello-protected key
- `unprotect(keyTag, data)` - Decrypt data after Windows Hello verification
- `deleteKey(keyTag)` - Remove the protected key

## Security

- AES-256-GCM encryption for all data
- DPAPI (CryptProtectData) for key storage, bound to the current Windows user
- Windows Hello biometric/PIN prompt before every encrypt/decrypt operation
- Keys are cached in memory within the process for the lifetime of the session
