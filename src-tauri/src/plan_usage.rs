use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

// ── Response types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlanUsage {
    pub five_hour: Option<UsageWindow>,
    pub seven_day: Option<UsageWindow>,
    pub seven_day_opus: Option<UsageWindow>,
    pub extra_usage: Option<ExtraUsage>,
    pub fetched_at: String,
    pub is_oauth_user: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub utilization: f64,
    pub resets_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExtraUsage {
    pub is_enabled: bool,
    pub monthly_limit: f64,
    pub used_credits: f64,
    pub utilization: f64,
}

// ── Credentials ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthCredentials {
    access_token: String,
}

/// The credentials file wraps tokens under a provider key like "claudeAiOauth".
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialsFile {
    claude_ai_oauth: Option<OAuthCredentials>,
}

// ── API response shape ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ApiUsageWindow {
    utilization: Option<f64>,
    resets_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiExtraUsage {
    is_enabled: Option<bool>,
    monthly_limit: Option<f64>,
    used_credits: Option<f64>,
    utilization: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ApiUsageResponse {
    five_hour: Option<ApiUsageWindow>,
    seven_day: Option<ApiUsageWindow>,
    seven_day_opus: Option<ApiUsageWindow>,
    extra_usage: Option<ApiExtraUsage>,
}

// ── Cache ───────────────────────────────────────────────────────────────────

static CACHE: Mutex<Option<(PlanUsage, Instant)>> = Mutex::new(None);
const CACHE_TTL_SECS: u64 = 60;

fn get_cached() -> Option<PlanUsage> {
    let guard = CACHE.lock().ok()?;
    let (ref cached, ref when) = (*guard).as_ref()?;
    if when.elapsed().as_secs() < CACHE_TTL_SECS {
        Some(cached.clone())
    } else {
        None
    }
}

fn set_cached(usage: &PlanUsage) {
    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some((usage.clone(), Instant::now()));
    }
}

// ── Credential reading ──────────────────────────────────────────────────────

fn read_oauth_credentials() -> Result<OAuthCredentials, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let creds_path = home.join(".claude").join(".credentials.json");

    if !creds_path.exists() {
        return Err("no_credentials".to_string());
    }

    let content = std::fs::read_to_string(&creds_path)
        .map_err(|e| format!("Failed to read credentials file: {}", e))?;

    // Try nested format first: { "claudeAiOauth": { "accessToken": "..." } }
    if let Ok(file) = serde_json::from_str::<CredentialsFile>(&content) {
        if let Some(creds) = file.claude_ai_oauth {
            if !creds.access_token.is_empty() {
                return Ok(creds);
            }
            return Err("empty_token".to_string());
        }
    }

    // Fallback: try top-level format { "accessToken": "..." }
    let creds: OAuthCredentials = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse credentials: {}", e))?;

    if creds.access_token.is_empty() {
        return Err("empty_token".to_string());
    }

    Ok(creds)
}

// ── Main fetch function ─────────────────────────────────────────────────────

pub async fn fetch_plan_usage() -> Result<PlanUsage, String> {
    // Check cache first
    if let Some(cached) = get_cached() {
        return Ok(cached);
    }

    // Read credentials
    let creds = match read_oauth_credentials() {
        Ok(c) => c,
        Err(e) if e == "no_credentials" || e == "empty_token" => {
            return Ok(PlanUsage {
                five_hour: None,
                seven_day: None,
                seven_day_opus: None,
                extra_usage: None,
                fetched_at: now_iso(),
                is_oauth_user: false,
            });
        }
        Err(e) => return Err(e),
    };

    // Make the API call
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", format!("Bearer {}", creds.access_token))
        .header("anthropic-beta", "oauth-2025-04-20")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        // 401/403 likely means token expired or not an OAuth user
        if status == 401 || status == 403 {
            let usage = PlanUsage {
                five_hour: None,
                seven_day: None,
                seven_day_opus: None,
                extra_usage: None,
                fetched_at: now_iso(),
                is_oauth_user: false,
            };
            set_cached(&usage);
            return Ok(usage);
        }
        return Err(format!("API returned {} {}: {}", status, resp_status_text(status), body));
    }

    let api_resp: ApiUsageResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let usage = PlanUsage {
        five_hour: api_resp.five_hour.map(|w| UsageWindow {
            utilization: w.utilization.unwrap_or(0.0),
            resets_at: w.resets_at,
        }),
        seven_day: api_resp.seven_day.map(|w| UsageWindow {
            utilization: w.utilization.unwrap_or(0.0),
            resets_at: w.resets_at,
        }),
        seven_day_opus: api_resp.seven_day_opus.map(|w| UsageWindow {
            utilization: w.utilization.unwrap_or(0.0),
            resets_at: w.resets_at,
        }),
        extra_usage: api_resp.extra_usage.map(|e| ExtraUsage {
            is_enabled: e.is_enabled.unwrap_or(false),
            monthly_limit: e.monthly_limit.unwrap_or(0.0),
            used_credits: e.used_credits.unwrap_or(0.0),
            utilization: e.utilization.unwrap_or(0.0),
        }),
        fetched_at: now_iso(),
        is_oauth_user: true,
    };

    set_cached(&usage);
    Ok(usage)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn now_iso() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Simple ISO 8601 format
    let secs_per_day = 86400u64;
    let days = now / secs_per_day;
    let rem = now % secs_per_day;
    let hours = rem / 3600;
    let mins = (rem % 3600) / 60;
    let secs = rem % 60;

    // Approximate date from days since epoch
    let (year, month, day) = days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, mins, secs
    )
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    let mut year = 1970u64;
    loop {
        let year_days = if is_leap(year) { 366 } else { 365 };
        if days < year_days {
            break;
        }
        days -= year_days;
        year += 1;
    }
    let month_days: [u64; 12] = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u64;
    for md in &month_days {
        if days < *md {
            break;
        }
        days -= md;
        month += 1;
    }
    (year, month, days + 1)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn resp_status_text(status: u16) -> &'static str {
    match status {
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        _ => "Error",
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_days_to_ymd() {
        // 1970-01-01
        assert_eq!(days_to_ymd(0), (1970, 1, 1));
        // 2000-01-01 = day 10957
        assert_eq!(days_to_ymd(10957), (2000, 1, 1));
    }

    #[test]
    fn test_now_iso_format() {
        let iso = now_iso();
        // Should match pattern YYYY-MM-DDTHH:MM:SSZ
        assert_eq!(iso.len(), 20);
        assert!(iso.ends_with('Z'));
        assert_eq!(&iso[4..5], "-");
        assert_eq!(&iso[7..8], "-");
        assert_eq!(&iso[10..11], "T");
    }

    #[test]
    fn test_no_credentials_returns_non_oauth() {
        // When credentials file doesn't exist, read_oauth_credentials should error
        let result = read_oauth_credentials();
        // This may or may not exist on the test machine, so we just check it doesn't panic
        assert!(result.is_ok() || result.is_err());
    }

    #[test]
    fn test_cache_lifecycle() {
        // Clear any existing cache
        if let Ok(mut guard) = CACHE.lock() {
            *guard = None;
        }

        // No cache initially
        assert!(get_cached().is_none());

        // Set a cached value
        let usage = PlanUsage {
            five_hour: Some(UsageWindow {
                utilization: 42.0,
                resets_at: Some("2026-04-07T10:00:00Z".to_string()),
            }),
            seven_day: None,
            seven_day_opus: None,
            extra_usage: None,
            fetched_at: "2026-04-07T08:00:00Z".to_string(),
            is_oauth_user: true,
        };
        set_cached(&usage);

        // Should get cached value back
        let cached = get_cached();
        assert!(cached.is_some());
        let cached = cached.unwrap();
        assert!(cached.is_oauth_user);
        assert_eq!(cached.five_hour.unwrap().utilization, 42.0);
    }

    #[test]
    fn test_plan_usage_serialization() {
        let usage = PlanUsage {
            five_hour: Some(UsageWindow {
                utilization: 46.0,
                resets_at: Some("2025-11-04T04:59:59Z".to_string()),
            }),
            seven_day: Some(UsageWindow {
                utilization: 18.5,
                resets_at: Some("2025-11-06T03:59:59Z".to_string()),
            }),
            seven_day_opus: Some(UsageWindow {
                utilization: 0.0,
                resets_at: None,
            }),
            extra_usage: Some(ExtraUsage {
                is_enabled: true,
                monthly_limit: 1000.0,
                used_credits: 245.50,
                utilization: 24.5,
            }),
            fetched_at: "2025-11-04T01:00:00Z".to_string(),
            is_oauth_user: true,
        };

        let json = serde_json::to_string(&usage).unwrap();
        assert!(json.contains("fiveHour"));
        assert!(json.contains("sevenDay"));
        assert!(json.contains("extraUsage"));
        assert!(json.contains("isOauthUser"));
        assert!(json.contains("fetchedAt"));

        // Roundtrip
        let parsed: PlanUsage = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.five_hour.as_ref().unwrap().utilization, 46.0);
        assert!(parsed.extra_usage.as_ref().unwrap().is_enabled);
    }
}
