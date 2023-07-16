import { Buffer } from "node:buffer";
import * as crypto from "node:crypto";
import * as querystring from "node:querystring";

import config from "./config.json" assert { type: "json" };
import express, { Request, Response } from "express";

function generateRandomString(length: number): string {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from(
        { length },
        () => characters[crypto.randomInt(characters.length)]
    ).join("");
}

function redirect_uri(): string {
    const scheme = config.redirect_uri.scheme ?? "http";
    const host = config.redirect_uri.host ?? "localhost";
    const port = config.redirect_uri.port ?? 8080;
    const path = config.redirect_uri.path ?? "/";
    return `${scheme}://${host}:${port}${path}`;
}

function authorizationBasicClientBase64(): string {
    const client_id = config.client_id;
    const client_secret = config.client_secret;
    return Buffer.from(`${client_id}:${client_secret}`).toString("base64");
}

type Data = {
    access_token: string | null;
    token_type: string | null;
    scope: string | null;
    expires_in: string | null;
    refresh_token: string | null;
};

const data: Data = {
    access_token: null,
    token_type: null,
    scope: null,
    expires_in: null,
    refresh_token: null,
};

let code: string;
let state: string;

const app = express();

app.get("/", async (_req: Request, res: Response) => {
    const resultResponse = await fetch(
        new URL("https://api.spotify.com/v1/users/spotify"),
        {
            cache: "no-cache",
            headers: new Headers({
                Authorization: `Bearer ${data.access_token}`,
            }),
            method: "GET",
        }
    );
    const result = await resultResponse.json();

    if (result.error != null) {
        return res.redirect("/login");
    }

    return res.send(data);
});

app.get("/login", (_req: Request, res: Response) => {
    state = generateRandomString(16);
    return res.redirect(
        "https://accounts.spotify.com/authorize?" +
            querystring.stringify({
                client_id: config.client_id,
                response_type: "code",
                redirect_uri: redirect_uri(),
                state: state,
                scope: config.scope.join(" "),
                show_dialog: false,
            })
    );
});

app.get("/callback", (req: Request, res: Response) => {
    if (req.query.state != state) {
        return res
            .status(400)
            .send(
                "The generated state doesn't match the received one, watch out for cross-site request forgery attacks!"
            );
    }

    if (req.query.error != null) {
        return res.status(400).send(req.query.error);
    }

    code = req.query.code as string;

    return res.redirect("/access");
});

app.get("/access", async (_req: Request, res: Response) => {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", redirect_uri());

    const resultResponse = await fetch(
        new URL("https://accounts.spotify.com/api/token"),
        {
            body: body,
            cache: "no-cache",
            headers: new Headers({
                Authorization: `Basic ${authorizationBasicClientBase64()}`,
                "Content-Type": "application/x-www-form-urlencoded",
            }),
            method: "POST",
        }
    );
    const result = await resultResponse.json();

    data.access_token = result.access_token;
    data.token_type = result.token_type;
    data.scope = result.scope;
    data.expires_in = result.expires_in;
    data.refresh_token = result.refresh_token;

    return res.redirect("/");
});

app.get("/refresh", async (_req: Request, res: Response) => {
    if (data.refresh_token == null) {
        return res.redirect("/");
    }

    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("refresh_token", data.refresh_token);

    const resultResponse = await fetch(
        new URL("https://accounts.spotify.com/api/token"),
        {
            body: body,
            cache: "no-cache",
            headers: new Headers({
                Authorization: `Basic ${authorizationBasicClientBase64()}`,
                "Content-Type": "application/x-www-form-urlencoded",
            }),
            method: "POST",
        }
    );
    const result = await resultResponse.json();

    data.access_token = result.access_token;
    data.token_type = result.token_type;
    data.scope = result.scope;
    data.expires_in = result.expires_in;

    return res.redirect("/");
});

const host = config.redirect_uri.host ?? "localhost";
const port = config.redirect_uri.port ?? 8080;
app.listen(port, host, () =>
    console.info(`Listening on http://${host}:${port}`)
);
