# Manual Testing Steps

## Authentication
1. Navigate to `/register` and create a test account.
2. Confirm the success alert and automatic redirect to the login page.
3. Go to `/login` and sign in with the same credentials.
4. Verify you are redirected to the dashboard without errors.

## Contract Creation
1. Open the contract creation page.
2. Complete required fields and submit.
3. Observe the success alert and confirm the contract is saved in local storage.

## Contract Editing
1. From a contract view, choose to edit the contract.
2. Modify data and save changes.
3. A confirmation alert appears and the version history reflects your profile as the editor.

## Contract History Restore
1. Visit a contract's history page.
2. Use the restore action on any version.
3. An alert confirms the selected version has been restored (simulated).

## Document Upload
1. Navigate to the document upload page and add a file.
2. Submit the form and verify the success notification.
3. Check local storage for a new `uploadedDocuments` entry.

## Case Activities
1. Open a case's activities page.
2. Create a new activity and save it.
3. Ensure the activity list shows your profile as the creator.

## Invitation Email Error Handling
1. Deploy the `send-invitation-email` Edge Function locally or on Supabase and configure a temporary invalid Resend API key.
2. Trigger an invitation email from the UI using a test account.
3. Confirm the UI now surfaces the "Failed to send invitation email" error returned by the function instead of a false success message.
