use rand::RngCore;

/// A per-run secret the webview gets as a cookie on the first HTML response.
/// Every other request must echo it, which keeps other local processes off a
/// port that is otherwise a live authenticated session to the gateway.
// Clone: AppState derives Clone (Task 1); Arc<AppState> would work without it,
// but keeping AppState itself cloneable means every field must be too.
#[derive(Clone)]
pub struct Nonce(String);

impl Nonce {
    pub fn new() -> Self {
        let mut bytes = [0u8; 16];
        rand::rng().fill_bytes(&mut bytes);
        Nonce(hex::encode(bytes))
    }

    // Only the tests below call this; the bin target compiles them out, so
    // clippy sees no caller without the allow.
    #[allow(dead_code)]
    pub fn value(&self) -> &str {
        &self.0
    }

    pub fn set_cookie(&self) -> String {
        format!("dsk={}; Path=/; SameSite=Strict; HttpOnly", self.0)
    }

    pub fn matches(&self, cookie_header: Option<&str>) -> bool {
        let Some(header) = cookie_header else {
            return false;
        };
        header
            .split(';')
            .filter_map(|c| c.trim().split_once('='))
            .any(|(k, v)| k == "dsk" && constant_time_eq(v, &self.0))
    }
}

// This is the authorization decision guarding a live gateway session; a
// short-circuiting `==` would leak the nonce one byte at a time to a
// co-resident process timing responses, exactly the attacker this guard
// exists for. Length may short-circuit (the length is not the secret); the
// byte fold accumulates into one variable and is tested once at the end so
// it cannot be optimized into an early exit.
fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_its_own_cookie() {
        let n = Nonce::new();
        let header = format!("dsk={}", n.value());
        assert!(n.matches(Some(&header)));
    }

    #[test]
    fn accepts_when_other_cookies_are_present() {
        let n = Nonce::new();
        let header = format!("theme=dark; dsk={}; other=1", n.value());
        assert!(n.matches(Some(&header)));
    }

    #[test]
    fn rejects_missing_and_wrong() {
        let n = Nonce::new();
        assert!(!n.matches(None));
        assert!(!n.matches(Some("")));
        assert!(!n.matches(Some("dsk=deadbeef")));
        assert!(!n.matches(Some("theme=dark")));
    }

    #[test]
    fn rejects_same_length_wrong_value() {
        let n = Nonce::new();
        // Same length as a real nonce, guaranteed different content: flips
        // every hex digit into another one from the same alphabet.
        let wrong: String = n
            .value()
            .chars()
            .map(|c| if c == '0' { '1' } else { '0' })
            .collect();
        let header = format!("dsk={wrong}");
        assert!(!n.matches(Some(&header)));
    }

    #[test]
    fn two_nonces_differ() {
        assert_ne!(Nonce::new().value(), Nonce::new().value());
    }

    #[test]
    fn set_cookie_is_session_scoped_and_strict() {
        let n = Nonce::new();
        let c = n.set_cookie();
        assert!(c.starts_with(&format!("dsk={}", n.value())));
        assert!(c.contains("Path=/"));
        assert!(c.contains("SameSite=Strict"));
        assert!(c.contains("HttpOnly"));
        // No Max-Age: the nonce must not outlive the process that issued it.
        assert!(!c.contains("Max-Age"));
    }
}
