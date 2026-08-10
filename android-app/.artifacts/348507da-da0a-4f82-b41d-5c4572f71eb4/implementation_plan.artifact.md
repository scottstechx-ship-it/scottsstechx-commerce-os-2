# Implementation Plan: Enhancing CommerceOS User Experience

This plan aims to address current gaps in the CommerceOS app and add features that improve user engagement, especially for the target demographic.

## User Review Required

> [!IMPORTANT]
> The registration flow requires backend API support for `registerUser`. I will stub the API call if it's not yet available in the `ScottsTechXApi` interface, or we can coordinate on the endpoint details.

> [!TIP]
> Expanding Voice Input to the AI Chat will require user permission for the Microphone if not already granted.

## Proposed Changes

### 1. Registration Flow
**Goal**: Implement the missing sign-up process linked from the Login screen.

- **[MODIFY] [LoginScreen.kt](file:///E:/ScottsTechX life projects/ScottsTechX/android-app/app/src/main/java/com/scottsstechx/commerceos/ui/login/LoginScreen.kt)**: Link the "Create account" button to the new Registration screen.
- **[NEW] [RegistrationScreen.kt](file:///E:/ScottsTechX life projects/ScottsTechX/android-app/app/src/main/java/com/scottsstechx/commerceos/ui/login/RegistrationScreen.kt)**: A guided UI for selecting a role and entering basic details.
- **[NEW] [RegistrationViewModel.kt](file:///E:/ScottsTechX life projects/ScottsTechX/android-app/app/src/main/java/com/scottsstechx/commerceos/ui/login/RegistrationViewModel.kt)**: Handles registration logic and API interaction.

### 2. Voice-Enabled AI Chat
**Goal**: Allow users to ask the AI Shopping Assistant questions using their voice.

- **[MODIFY] [CustomerChatScreen.kt](file:///E:/ScottsTechX life projects/ScottsTechX/android-app/app/src/main/java/com/scottsstechx/commerceos/ui/ai/CustomerChatScreen.kt)**: Integrate `VoiceHelpButton` into the chat input row.

### 3. Settings & Accessibility Toggle
**Goal**: Allow users to switch between "Simple/Large" and "Standard" view modes.

- **[MODIFY] [Theme.kt](file:///E:/ScottsTechX life projects/ScottsTechX/android-app/app/src/main/java/com/scottsstechx/commerceos/ui/theme/Theme.kt)**: Update `ScottsTechXTheme` to accept a `largeType` boolean parameter.
- **[NEW] [SettingsScreen.kt](file:///E:/ScottsTechX life projects/ScottsTechX/android-app/app/src/main/java/com/scottsstechx/commerceos/ui/common/SettingsScreen.kt)**: Provide toggles for Theme and Typography scale.

### 4. Loyalty & Trust Dashboard
**Goal**: Visualize the user's progress and rewards to encourage usage.

- **[NEW] [LoyaltyDashboard.kt](file:///E:/ScottsTechX life projects/ScottsTechX/android-app/app/src/main/java/com/scottsstechx/commerceos/ui/buyer/LoyaltyDashboard.kt)**: A summary view of trust scores, completed orders, and earned badges.

---

## Verification Plan

### Automated Tests
- Unit tests for `RegistrationViewModel` to ensure correct role handling.
- Compose tests for `SettingsScreen` to verify theme toggle state.

### Manual Verification
- Deploy to an emulator/device and walk through the Registration flow.
- Test Voice Input in the AI Chat (requires a device with a microphone and STT engine).
- Toggle "Large Type" in Settings and verify UI scaling across screens.
