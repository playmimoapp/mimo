# Mimo real-phone check

This is the final human check before calling the Nimiq Pay experience verified.

## Two-minute happy path

1. Open the production Mimo link inside Nimiq Pay on Phone A.
2. Host a three-round event with a small NIM reward.
3. Open its invite on Phone B, join with a nickname, and tap **Verify wallet**.
4. Confirm that Nimiq Pay asks to expose an account and then asks to sign the one-time room message. No transaction dialog should appear.
5. Play all rounds. Confirm that reactions appear on both phones, the timer stays aligned, answers lock once, and scores reveal together.
6. Finish the event. On the winner’s phone, copy the payout address. On the host phone, paste it into the payout card.
7. Confirm the host sees the exact amount and shortened recipient before Nimiq Pay asks for payment approval.
8. Approve the small payment. Mimo must say **submitted**, not **confirmed**, until network confirmation is independently observed.

## Failure checks

- Close the account/signature prompt. Mimo should say nothing changed and let the participant retry.
- Turn off the network during a round, restore it, and confirm the same participant and locked answer return.
- Enter a different payout address. The server must reject it because it does not match the winner’s verified wallet fingerprint.
- Close the payment prompt. Mimo should say no NIM moved and let the host retry.
- Open a private room without its invite link. Entry must be rejected.

Record the phone model, OS, Nimiq Pay version, date, result, and any screen recording. Do not mark this check complete from a desktop simulation.
