import { Buffer } from "node:buffer";
import * as crypto from "node:crypto";
import * as querystring from "node:querystring";

import config from "./config.json" assert { type: "json" };
import Koa, { Context, Next } from "koa";
import Router from "@koa/router";

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

class Result {
    success: boolean;
    message: string | null;
    data: Data | null;

    constructor(success: boolean, message: string | null, data: Data | null) {
        this.success = success;
        this.message = message;
        this.data = data;
    }
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

const app = new Koa();
const router = new Router();

app.use(async (ctx: Context, next: Next) => {
    try {
        await next();
    } catch (error) {
        console.error(error);
        ctx.status = 500;
        ctx.body = new Result(false, null, null);
        return;
    }
});

router.get("/", async (ctx: Context) => {
    const response = await fetch(
        new URL("https://api.spotify.com/v1/users/spotify"),
        {
            cache: "no-cache",
            headers: new Headers({
                Authorization: `Bearer ${data.access_token}`,
            }),
            method: "GET",
        }
    );
    const result = await response.json();

    if (result.error != null) {
        return ctx.redirect("/login");
    }

    ctx.body = new Result(true, null, data);
    return;
});

router.get("/login", (ctx: Context) => {
    state = generateRandomString(16);
    return ctx.redirect(
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

router.get("/callback", (ctx: Context) => {
    if (ctx.query.state != state) {
        ctx.status = 400;
        ctx.body = new Result(
            false,
            "The generated state doesn't match the received one, watch out for cross-site request forgery attacks!",
            null
        );
        return;
    }

    if (ctx.query.error != null) {
        ctx.status = 400;
        ctx.body = new Result(false, ctx.query.error as string, null);
        return;
    }

    code = ctx.query.code as string;

    return ctx.redirect("/access");
});

router.get("/access", async (ctx: Context) => {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", redirect_uri());

    const response = await fetch(
        new URL("https://accounts.spotify.com/api/token"),
        {
            body,
            cache: "no-cache",
            headers: new Headers({
                Authorization: `Basic ${authorizationBasicClientBase64()}`,
                "Content-Type": "application/x-www-form-urlencoded",
            }),
            method: "POST",
        }
    );
    const result: Data = await response.json();

    data.access_token = result.access_token;
    data.token_type = result.token_type;
    data.scope = result.scope;
    data.expires_in = result.expires_in;
    data.refresh_token = result.refresh_token;

    return ctx.redirect("/");
});

router.get("/refresh", async (ctx: Context) => {
    if (data.refresh_token == null) {
        return ctx.redirect("/");
    }

    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("refresh_token", data.refresh_token);

    const response = await fetch(
        new URL("https://accounts.spotify.com/api/token"),
        {
            body,
            cache: "no-cache",
            headers: new Headers({
                Authorization: `Basic ${authorizationBasicClientBase64()}`,
                "Content-Type": "application/x-www-form-urlencoded",
            }),
            method: "POST",
        }
    );
    const result: Data = await response.json();

    data.access_token = result.access_token;
    data.token_type = result.token_type;
    data.scope = result.scope;
    data.expires_in = result.expires_in;

    return ctx.redirect("/");
});

app.use(router.routes());
app.use(router.allowedMethods());

const host = config.redirect_uri.host ?? "localhost";
const port = config.redirect_uri.port ?? 8080;

app.listen(port, host, () =>
    console.info(`Listening on http://${host}:${port}`)
);
