# M.E.R.I.T. Android release

The Android package is a Trusted Web Activity for the HTTPS service. It uses the same browser session, Google sign-in, and device passkeys as the web app.

- Package: `com.sravantix.merit`
- Target API: 36
- Version: 1.0.0 (code 1)
- Signed bundle: `android/app/build/outputs/bundle/release/signed-release.aab`
- Store files: `store/`
- Privacy and deletion pages: `../public/privacy.html`, `../public/delete-account.html`

## Rebuild

Run `npm ci` and `npm run generate` in this directory. With JDK 17 and Android SDK 36 installed, run `android/gradlew.bat bundleRelease` on Windows. Run `node sign-release.mjs` to sign with the existing upload key and verify the result. The upload key and DPAPI-encrypted password are under ignored `../release-secrets/`; make an independent secure backup. Never regenerate the key for an existing Play app. Increase `appVersionCode` in `twa-manifest.json` before the next upload.

The public `/.well-known/assetlinks.json` currently contains the upload certificate fingerprint for local testing. After Play App Signing is activated, add the **Play app-signing** SHA-256 fingerprint and redeploy the site. The Play certificate differs from the upload certificate.

Before submission, verify installation and login on a physical Android device, complete Play Console app-content and Data safety declarations, provide reviewer access that does not expose the owner's private records, and start closed testing. This personal Play account requires at least 12 opted-in testers for 14 continuous days per app before applying for production access.
