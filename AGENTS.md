# Autonomous Execution Rules

## Operating Guidelines
1. **Zero-Permission Execution**:
   - Operate with full autonomy.
   - Do NOT ask for user permission, approval, or confirmation before executing shell commands, creating files, modifying code, running database migrations, or running tests.
   - Proactively execute all necessary steps end-to-end to complete tasks.

2. **Proactive Diagnostics and Remediation**:
   - If an error, build failure, or test failure occurs, immediately inspect logs, identify the root cause, apply the required fix, and verify resolution without waiting for instructions.

3. **When to Prompt the User**:
   - Only prompt the user when external input that cannot be derived or automated is required (such as secret API keys, physical hardware interactions, or fundamental business decisions).
