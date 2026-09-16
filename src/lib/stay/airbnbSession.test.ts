import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { airbnbCookieHeader } from "./airbnbSession.server.ts";

describe("session cookies Airbnb", () => {
  it("relit le fichier du sidecar", () => {
    const dir = join(tmpdir(), `skitrack-sess-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "session.json");
    writeFileSync(
      path,
      JSON.stringify({
        cookies: [
          { name: "bev", value: "abc", domain: ".airbnb.com", path: "/" },
          { name: "everest_cookie", value: "1", domain: ".airbnb.com", path: "/" },
        ],
        cookies_at: Date.now() / 1000,
      }),
    );
    const prev = process.env.SKITRACK_AIRBNB_SESSION;
    process.env.SKITRACK_AIRBNB_SESSION = path;
    try {
      assert.equal(airbnbCookieHeader(), "bev=abc; everest_cookie=1");
    } finally {
      if (prev == null) delete process.env.SKITRACK_AIRBNB_SESSION;
      else process.env.SKITRACK_AIRBNB_SESSION = prev;
    }
  });
});
