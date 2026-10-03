// The throwaway demo keys of a page, written next to the log so the same keys sign the next entries after a reload. They
// are stored in the repo's own key-file shape (core/crypto key-file.ts) and read back through its strict parser: the did
// has to match the secret, the role has to match the slot, no field may be missing or added.
import { describe, expect, it } from "vitest";
import { keysFromFiles, newKeyMaterial } from "../../src/api/local/persist/keys";

// Built with Uint8Array.from: jsdom's TextEncoder hands back an array of another realm, which the signer refuses.
const MESSAGE = Uint8Array.from("laisee.test:persisted key", (c) => c.charCodeAt(0));

describe("newKeyMaterial", () => {
  it("makes an engine key and a delegator key with different dids", () => {
    const { keys } = newKeyMaterial();
    expect(keys.engine.did).toMatch(/^did:key:z/);
    expect(keys.delegator.did).toMatch(/^did:key:z/);
    expect(keys.engine.did).not.toBe(keys.delegator.did);
    expect(keys.source).toBe("ephemeral");
  });

  it("writes each key in the key-file shape, with its own did and role", () => {
    const { keys, files } = newKeyMaterial();
    expect(files.engine).toMatchObject({ kind: "laisee.ed25519-secret-key.v1", role: "engine", did: keys.engine.did });
    expect(files.delegator).toMatchObject({ kind: "laisee.ed25519-secret-key.v1", role: "delegator", did: keys.delegator.did });
    expect(files.engine.secret_key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(files.engine.note).toMatch(/Throwaway demo key/);
  });

  it("makes new keys every time", () => {
    expect(newKeyMaterial().keys.engine.did).not.toBe(newKeyMaterial().keys.engine.did);
  });

  it("keeps the secret out of the signer objects: JSON and String show the did only", () => {
    const { keys, files } = newKeyMaterial();
    for (const text of [JSON.stringify(keys), String(keys.engine), String(keys.delegator), JSON.stringify(keys.engine)]) {
      expect(text).not.toContain(files.engine.secret_key);
      expect(text).not.toContain(files.delegator.secret_key);
    }
  });
});

describe("keysFromFiles", () => {
  it("rebuilds signers that sign exactly like the originals (Ed25519 is deterministic: a replayed seal is byte for byte the same)", () => {
    const made = newKeyMaterial();
    const back = keysFromFiles(made.files);
    expect(back.engine.did).toBe(made.keys.engine.did);
    expect(back.delegator.did).toBe(made.keys.delegator.did);
    expect(back.engine.sign(MESSAGE)).toEqual(made.keys.engine.sign(MESSAGE));
    expect(back.delegator.sign(MESSAGE)).toEqual(made.keys.delegator.sign(MESSAGE));
  });

  it("refuses a did that is not the secret's", () => {
    const { files } = newKeyMaterial();
    const other = newKeyMaterial().files;
    expect(() => keysFromFiles({ ...files, engine: { ...files.engine, did: other.engine.did } })).toThrow(/did does not match/);
  });

  it("refuses a secret swapped for another key's", () => {
    const { files } = newKeyMaterial();
    const other = newKeyMaterial().files;
    expect(() => keysFromFiles({ ...files, delegator: { ...files.delegator, secret_key: other.delegator.secret_key } })).toThrow();
  });

  it("refuses a key in the wrong slot (the roles stay apart)", () => {
    const { files } = newKeyMaterial();
    expect(() => keysFromFiles({ engine: files.delegator, delegator: files.engine })).toThrow(/role/);
  });

  it("refuses a malformed secret, a missing field and an added field, without echoing the secret", () => {
    const { files } = newKeyMaterial();
    const secret = files.engine.secret_key;
    const attempts = [
      { ...files, engine: { ...files.engine, secret_key: "short" } },
      { ...files, engine: { ...files.engine, secret_key: `${secret}AA` } },
      { ...files, engine: { kind: files.engine.kind, role: files.engine.role, did: files.engine.did, note: files.engine.note } },
      { ...files, engine: { ...files.engine, extra: "x" } },
    ];
    for (const attempt of attempts) {
      let message = "";
      try {
        keysFromFiles(attempt as never);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).not.toBe("");
      expect(message).not.toContain(secret);
    }
  });

  it("refuses one key used for both roles", () => {
    const { files } = newKeyMaterial();
    const same = { ...files.engine, role: "delegator" };
    expect(() => keysFromFiles({ engine: files.engine, delegator: same as never })).toThrow();
  });
});
