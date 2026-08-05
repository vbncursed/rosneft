use rand::RngCore;

/// A per-run secret handed to the webview out of band — `main.rs` opens the
/// window on `http://127.0.0.1:{port}/?dsk={nonce}` — and turned into a
/// session cookie by the `index.html` response that carries it. Every request
/// afterwards must echo the cookie, which keeps other local processes off a
/// port that is otherwise a live authenticated session to the gateway.
///
/// The URL is the only place the nonce is ever published, and only the webview
/// we launched is opened on it. Setting the cookie on *every* `index.html`
/// response instead made the guard a two-request formality: `GET /` handed the
/// nonce to any caller, who then replayed it.
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

    #[cfg(test)]
    pub fn value(&self) -> &str {
        &self.0
    }

    pub fn set_cookie(&self) -> String {
        format!("{NAME}={}; Path=/; SameSite=Strict; HttpOnly", self.0)
    }

    /// The query string `main.rs` opens the webview with. The single place the
    /// nonce leaves this process other than the cookie it becomes.
    pub fn query_param(&self) -> String {
        format!("{NAME}={}", self.0)
    }

    pub fn matches(&self, cookie_header: Option<&str>) -> bool {
        self.present_in(cookie_header, ';')
    }

    /// The handoff: a request whose query carries the nonce is the webview's
    /// first load, and only that response is allowed to set the cookie.
    pub fn matches_query(&self, query: Option<&str>) -> bool {
        self.present_in(query, '&')
    }

    /// Cookie headers separate on `;`, query strings on `&`; the pair syntax
    /// and the comparison are otherwise identical, and there must be exactly
    /// one comparison — see `constant_time_eq` below.
    fn present_in(&self, raw: Option<&str>, separator: char) -> bool {
        let Some(raw) = raw else {
            return false;
        };
        raw.split(separator)
            .filter_map(|c| c.trim().split_once('='))
            .any(|(k, v)| k == NAME && constant_time_eq(v, &self.0))
    }
}

/// The cookie name and the query parameter name, deliberately the same one.
const NAME: &str = "dsk";

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

    // The out-of-band handoff: the webview's first URL carries the nonce in
    // the query, and that is the only request allowed to set the cookie.
    #[test]
    fn accepts_its_own_query_parameter() {
        let n = Nonce::new();
        assert!(n.matches_query(Some(&n.query_param())));
        assert!(n.matches_query(Some(&format!("next=/home&{}", n.query_param()))));
    }

    #[test]
    fn rejects_a_missing_or_wrong_query_parameter() {
        let n = Nonce::new();
        assert!(!n.matches_query(None));
        assert!(!n.matches_query(Some("")));
        assert!(!n.matches_query(Some("dsk=deadbeef")));
        assert!(!n.matches_query(Some("jobId=abc")));
    }

    // A cookie header is not a query string: `;` and `&` must not be
    // interchangeable, or a caller could smuggle one shape into the other.
    #[test]
    fn the_two_separators_do_not_cross_over() {
        let n = Nonce::new();
        let pair = n.query_param();
        assert!(!n.matches_query(Some(&format!("a=1;{pair}"))));
        assert!(!n.matches(Some(&format!("a=1&{pair}"))));
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
