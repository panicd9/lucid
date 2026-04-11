/// Runtime length check — returns InvalidInstructionData
macro_rules! require_len {
    ($data:expr, $len:expr) => {
        if $data.len() < $len {
            return Err(ProgramError::InvalidInstructionData);
        }
    };
}

/// Runtime length check — returns InvalidAccountData
macro_rules! require_account_len {
    ($data:expr, $len:expr) => {
        if $data.len() < $len {
            return Err(ProgramError::InvalidAccountData);
        }
    };
}

/// Validates byte 0 matches expected discriminator and byte 1 matches version
macro_rules! validate_discriminator {
    ($data:expr, $disc:expr) => {
        if $data.len() < 2 || $data[0] != $disc || $data[1] != crate::state::constants::ACCOUNT_VERSION {
            return Err(ProgramError::InvalidAccountData);
        }
    };
}

/// Validates account owner matches expected program ID
macro_rules! require_owner {
    ($account:expr, $owner:expr) => {
        if $account.owner() != $owner {
            return Err(ProgramError::IllegalOwner);
        }
    };
}

/// Compile-time: asserts struct size matches expected
macro_rules! assert_no_padding {
    ($t:ty, $expected:expr) => {
        const _: () = assert!(
            core::mem::size_of::<$t>() == $expected,
            "struct size mismatch — check for unexpected padding"
        );
    };
}
