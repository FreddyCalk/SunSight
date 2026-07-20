# Contact matching privacy disclosure

Sunsight uses contact matching to decide who may receive a nearby blast. This
page states the disclosure that must be presented before contact access and
reflected in the privacy policy.

## What Sunsight observes

After explicit contact-access consent, the mobile app normalizes supported
US/Canada phone numbers to `+1` E.164 and sends them over TLS to the
authenticated `match-contacts` Edge Function. Sunsight infrastructure therefore
observes those raw contact numbers transiently while processing the request.
The design does not hide the numbers from Sunsight itself.

The function computes `HMAC-SHA-256(server_secret, e164_number)` with the
server-only `PHONE_HMAC_SECRET`, matches those values against verified users,
and immediately clears the in-memory arrays holding raw numbers and digests.
Raw contact numbers are not logged or persisted. The database stores only
expiring sender-to-user match identifiers in `contact_matches`, not a copy of
the address book and not contact HMAC values.

Plain SHA-256 is not used. Phone-number space is enumerable, so an attacker can
reverse unsalted phone hashes by trying likely numbers. A server-keyed HMAC
prevents that offline enumeration unless the server secret is also compromised.

## Current matching contract

- Supported numbers: US/Canada `+1` E.164 only.
- Consent: the request must contain `consented: true` and an ISO timestamp.
- Direction: eligibility is one-way. The sender must have the recipient in
  their matched contacts; mutual address-book membership is not required.
- Request cap: at most 1,000 numbers per synchronization request.
- Persistence: only matched user IDs and consent/expiry metadata are retained.
- Response: synchronization reports success only. The database replacement RPC
  returns `void`, and the Edge Function does not return a match count or matched
  identities that could act as a registered-phone oracle.
- HMAC version: version 1. Rotation requires a versioned migration and overlap;
  the active version 1 key must not be overwritten in place.

Contact matching does not by itself make a recipient eligible. Recipient
selection also checks active status, recent and accurate location, configured
distance, bilateral blocks, active mutes, and the recipient cap.

## Required user-facing disclosure

Use language with the following substance before uploading contacts:

> With your permission, Sunsight sends supported phone numbers from your
> contacts to Sunsight over an encrypted connection to find registered people
> you may notify. Sunsight briefly processes those numbers, protects matching
> with a server-secret HMAC rather than plain SHA-256, discards the raw numbers,
> and stores only temporary matches to Sunsight user IDs.

Legal review may adjust wording, but it must not remove the fact that Sunsight
infrastructure transiently observes the raw phone numbers.
