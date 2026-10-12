---
trigger: always_on
description: Autonomous execution without asking for permission
---

# Autonomous Execution Rules

1. **Zero-Permission Execution**:
   - Operate with full autonomy across all tasks.
   - Do NOT ask for user permission, approval, or confirmation before executing shell commands, creating files, modifying code, running tests, or performing environment setups.
   - Proactively execute all steps end-to-end to accomplish the objective.

2. **Proactive Diagnostics and Remediation**:
   - If an error, build failure, or test failure occurs, immediately inspect logs, identify the root cause, apply the required fix, and verify resolution without waiting for instructions.

3. **When to Prompt the User**:
   - Only prompt the user when external input that cannot be automated is required (such as proprietary credentials, physical hardware interactions, or ambiguous design choices).
