use serde::{Deserialize, Serialize};

const SERVICE: &str = "fun.vbncursed.andrey.desktop";
const ACCOUNT: &str = "session";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Stored {
    pub token: String,
    pub user_id: String,
}

/// Every keychain error is swallowed on purpose: a Linux box with no Secret
/// Service must still run the app, it just asks for a login each start.
pub fn load() -> Option<Stored> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).ok()?;
    let raw = entry.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn store(s: &Stored) {
    if let (Ok(entry), Ok(raw)) = (
        keyring::Entry::new(SERVICE, ACCOUNT),
        serde_json::to_string(s),
    ) {
        let _ = entry.set_password(&raw);
    }
}

pub fn clear() {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        let _ = entry.delete_credential();
    }
}

pub fn user_id_from_me(body: &[u8]) -> Option<String> {
    let v: serde_json::Value = serde_json::from_slice(body).ok()?;
    v.get("id")?.as_str().map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_id_out_of_me() {
        let body = br#"{"id":"usr_7","email":"a@b.c","isOwner":false}"#;
        assert_eq!(user_id_from_me(body), Some("usr_7".to_string()));
    }

    #[test]
    fn returns_none_on_garbage() {
        assert_eq!(user_id_from_me(b"not json"), None);
        assert_eq!(user_id_from_me(br#"{"email":"a@b.c"}"#), None);
        assert_eq!(user_id_from_me(br#"{"id":42}"#), None);
    }
}
