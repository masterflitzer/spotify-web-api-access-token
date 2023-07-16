# Spotify Web API Access Token

- Authorization Code Flow: <https://developer.spotify.com/documentation/web-api>

## Endpoints

- [Home (/)](http://localhost:8080/): Display retrieved data or when invalid redirects to `Login`
- [Login (/login)](http://localhost:8080/login): **Request User Authorization** by redirecting to Spotify Login which will in turn redirect to `Callback`
- [Callback (/callback)](http://localhost:8080/callback): *Don't access manually*, Spotify will redirect here and if successful redirects to `Access`
- [Access (/access)](http://localhost:8080/access): **Request Access Token** and save data temporarily then redirects to `Home`
- [Refresh (/refresh)](http://localhost:8080/refresh): **Request a refreshed Access Token** and save data temporarily then redirects to `Home`

## Usage

### Deno

```sh
npm i
deno run --allow-env --allow-net=localhost:8080,accounts.spotify.com,api.spotify.com --allow-read=. app.ts
```

### NodeJS

```sh
npm i
tsc && node app.js
```

## Example of using the requested Access Token

Get playlists of current user, filter by public, collaborative and user id and only show name, owner display name, public and collaborative fields

```sh
TOKEN="" # paste your token between the quotes
LIMIT="50"
OFFSET="0"
curl -Ls -H "Cache-Control: no-cache" -H "Authorization: Bearer ${TOKEN}" "https://api.spotify.com/v1/me/playlists?limit=${LIMIT}&offset=${OFFSET}" | jq '.items[] | select((.public or .collaborative) and (.owner.id | ascii_downcase) == "masterflitzer") | { name, owner: .owner.display_name, public, collaborative }' | less
```
