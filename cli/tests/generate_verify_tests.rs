use sha2::{Digest, Sha256};
use std::process::Command;
use tempfile::TempDir;

/// Compute the Anchor discriminator: SHA-256("global:{snake_case_name}")[..8]
fn anchor_discriminator(name: &str) -> Vec<u8> {
    let input = format!("global:{}", name);
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let hash = hasher.finalize();
    hash[..8].to_vec()
}

/// Return the path to the compiled `lucid` binary.
fn lucid_bin() -> String {
    // CARGO_BIN_EXE_lucid is set by cargo test for [[bin]] named "lucid"
    env!("CARGO_BIN_EXE_lucid").to_string()
}

/// Sample Anchor IDL JSON in the old format (isMut/isSigner) that matches
/// what the CLI's generate command actually parses.
fn sample_idl_json() -> String {
    r#"{
  "name": "sample_protocol",
  "address": "SampProtoco1111111111111111111111111111111111",
  "instructions": [
    {
      "name": "updateAdmin",
      "accounts": [
        { "name": "admin", "isMut": false, "isSigner": true },
        { "name": "state", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "new_admin", "type": "publicKey" }
      ]
    },
    {
      "name": "withdraw",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "vault", "isMut": true, "isSigner": false },
        { "name": "destination", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "initialize",
      "accounts": [
        { "name": "payer", "isMut": true, "isSigner": true },
        { "name": "state", "isMut": true, "isSigner": false }
      ],
      "args": []
    }
  ]
}"#
    .to_string()
}

/// Write the sample IDL to a temp file and return (TempDir, idl_path).
fn write_idl() -> (TempDir, String) {
    let dir = TempDir::new().unwrap();
    let idl_path = dir.path().join("sample.json");
    std::fs::write(&idl_path, sample_idl_json()).unwrap();
    (dir, idl_path.to_string_lossy().to_string())
}

// -------------------------------------------------------------------------
// Test 1: generate produces 3 JSON files
// -------------------------------------------------------------------------

#[test]
fn generate_produces_three_json_files() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    let output = Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");

    assert!(
        output.status.success(),
        "lucid generate failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let json_files: Vec<_> = std::fs::read_dir(out_dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "json")
                .unwrap_or(false)
        })
        .collect();

    assert_eq!(
        json_files.len(),
        3,
        "expected 3 JSON files, got {}",
        json_files.len()
    );
}

// -------------------------------------------------------------------------
// Test 2: generated files parse as valid IntentDefinition JSON
// -------------------------------------------------------------------------

#[test]
fn generated_files_are_valid_intent_definitions() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    let output = Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");
    assert!(output.status.success());

    for entry in std::fs::read_dir(out_dir.path()).unwrap() {
        let entry = entry.unwrap();
        if entry.path().extension().map(|e| e == "json").unwrap_or(false) {
            let content = std::fs::read_to_string(entry.path()).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&content).unwrap_or_else(|e| {
                panic!(
                    "failed to parse {}: {}",
                    entry.file_name().to_string_lossy(),
                    e
                )
            });
            // Must have the key fields of IntentDefinition
            assert!(parsed.get("version").is_some(), "missing 'version'");
            assert!(
                parsed.get("instructionName").is_some(),
                "missing 'instructionName'"
            );
            assert!(
                parsed.get("discriminator").is_some(),
                "missing 'discriminator'"
            );
            assert!(parsed.get("accounts").is_some(), "missing 'accounts'");
            assert!(
                parsed.get("dataSegments").is_some(),
                "missing 'dataSegments'"
            );
            assert!(parsed.get("template").is_some(), "missing 'template'");
            assert!(parsed.get("riskLevel").is_some(), "missing 'riskLevel'");
        }
    }
}

// -------------------------------------------------------------------------
// Test 3: update_admin is CRITICAL with 86400s timelock
// -------------------------------------------------------------------------

#[test]
fn update_admin_is_critical_risk() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");

    let content =
        std::fs::read_to_string(out_dir.path().join("update_admin.json")).unwrap();
    let intent: serde_json::Value = serde_json::from_str(&content).unwrap();

    assert_eq!(
        intent["riskLevel"].as_str().unwrap(),
        "CRITICAL",
        "update_admin should be CRITICAL"
    );
    assert_eq!(
        intent["timelockSeconds"].as_u64().unwrap(),
        86400,
        "update_admin timelock should be 86400"
    );
}

// -------------------------------------------------------------------------
// Test 4: withdraw is HIGH with 3600s timelock
// -------------------------------------------------------------------------

#[test]
fn withdraw_is_high_risk() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");

    let content =
        std::fs::read_to_string(out_dir.path().join("withdraw.json")).unwrap();
    let intent: serde_json::Value = serde_json::from_str(&content).unwrap();

    assert_eq!(
        intent["riskLevel"].as_str().unwrap(),
        "HIGH",
        "withdraw should be HIGH"
    );
    assert_eq!(
        intent["timelockSeconds"].as_u64().unwrap(),
        3600,
        "withdraw timelock should be 3600"
    );
}

// -------------------------------------------------------------------------
// Test 5: initialize is LOW with 0s timelock
// -------------------------------------------------------------------------

#[test]
fn initialize_is_low_risk() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");

    let content =
        std::fs::read_to_string(out_dir.path().join("initialize.json")).unwrap();
    let intent: serde_json::Value = serde_json::from_str(&content).unwrap();

    assert_eq!(
        intent["riskLevel"].as_str().unwrap(),
        "LOW",
        "initialize should be LOW"
    );
    assert_eq!(
        intent["timelockSeconds"].as_u64().unwrap(),
        0,
        "initialize timelock should be 0"
    );
}

// -------------------------------------------------------------------------
// Test 6: discriminators match sha256("global:{name}")[..8]
// -------------------------------------------------------------------------

#[test]
fn discriminators_match_sha256() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");

    let cases = vec![
        ("update_admin.json", "update_admin"),
        ("withdraw.json", "withdraw"),
        ("initialize.json", "initialize"),
    ];

    for (filename, ix_name) in cases {
        let content = std::fs::read_to_string(out_dir.path().join(filename)).unwrap();
        let intent: serde_json::Value = serde_json::from_str(&content).unwrap();

        let disc_arr = intent["discriminator"]
            .as_array()
            .expect("discriminator should be an array");
        let disc_bytes: Vec<u8> = disc_arr.iter().map(|v| v.as_u64().unwrap() as u8).collect();

        let expected = anchor_discriminator(ix_name);
        assert_eq!(
            disc_bytes, expected,
            "discriminator mismatch for {}: got {:?}, expected {:?}",
            ix_name, disc_bytes, expected
        );
    }
}

// -------------------------------------------------------------------------
// Test 7: verify succeeds on untampered generated intents
// -------------------------------------------------------------------------

#[test]
fn verify_succeeds_on_generated_intents() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");

    let output = Command::new(lucid_bin())
        .args(["verify", "--intents", &out_path, "--idl", &idl_path])
        .output()
        .expect("failed to run lucid verify");

    assert!(
        output.status.success(),
        "verify should succeed on untampered intents.\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

// -------------------------------------------------------------------------
// Test 8: tamper discriminator then verify fails
// -------------------------------------------------------------------------

#[test]
fn verify_fails_on_tampered_discriminator() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");

    // Tamper the withdraw intent discriminator
    let withdraw_path = out_dir.path().join("withdraw.json");
    let content = std::fs::read_to_string(&withdraw_path).unwrap();
    let mut intent: serde_json::Value = serde_json::from_str(&content).unwrap();

    // Replace discriminator with garbage
    intent["discriminator"] = serde_json::json!([0, 0, 0, 0, 0, 0, 0, 0]);
    std::fs::write(&withdraw_path, serde_json::to_string_pretty(&intent).unwrap()).unwrap();

    let output = Command::new(lucid_bin())
        .args(["verify", "--intents", &out_path, "--idl", &idl_path])
        .output()
        .expect("failed to run lucid verify");

    assert!(
        !output.status.success(),
        "verify should fail on tampered discriminator.\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

// -------------------------------------------------------------------------
// Test 9: template heuristics for update_admin
// -------------------------------------------------------------------------

#[test]
fn update_admin_template_contains_admin_or_authority() {
    let (_idl_dir, idl_path) = write_idl();
    let out_dir = TempDir::new().unwrap();
    let out_path = out_dir.path().to_string_lossy().to_string();

    Command::new(lucid_bin())
        .args(["generate", "--idl", &idl_path, "--output", &out_path])
        .output()
        .expect("failed to run lucid generate");

    let content =
        std::fs::read_to_string(out_dir.path().join("update_admin.json")).unwrap();
    let intent: serde_json::Value = serde_json::from_str(&content).unwrap();

    let template = intent["template"]
        .as_str()
        .expect("template should be a string");
    let template_lower = template.to_lowercase();

    assert!(
        template_lower.contains("admin") || template_lower.contains("authority"),
        "update_admin template should mention 'admin' or 'authority', got: '{}'",
        template
    );
}
