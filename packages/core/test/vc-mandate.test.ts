// VC 2.0 needs a URL as the credential id: urn:laisee:mandate:<mnd_id>. The domain Mandate keeps mnd_...
import { describe, expect, it } from "vitest";
import type { MandateCredential } from "../src/generated";
import { validateMandate, validateMandateCredential } from "../src/schema";
import { loadFixture } from "../src/testing/fixtures";
import { credentialIdForMandate, MANDATE_URN_PREFIX, mandateFromCredential, mandateIdFromCredentialId } from "../src/vc";

describe("credential id <-> mandate id", () => {
  it("maps both ways", () => {
    expect(credentialIdForMandate("mnd_demoM0")).toBe("urn:laisee:mandate:mnd_demoM0");
    expect(mandateIdFromCredentialId("urn:laisee:mandate:mnd_demoM0")).toBe("mnd_demoM0");
    expect(MANDATE_URN_PREFIX).toBe("urn:laisee:mandate:");
  });

  it("rejects ids that are not the urn form of a mandate id", () => {
    for (const bad of ["mnd_demoM0", "urn:laisee:mandate:", "urn:laisee:mandate:log_demoM0", "urn:other:mnd_demoM0"]) {
      expect(() => mandateIdFromCredentialId(bad)).toThrow();
    }
    expect(() => credentialIdForMandate("demoM0")).toThrow();
  });

  it("schema accepts only the urn id on the credential and only mnd_ on the domain mandate", () => {
    const vc = loadFixture("mandate/m0.credential.json", "mandate-credential");
    expect(vc.id).toBe("urn:laisee:mandate:mnd_demoM0");
    expect(validateMandateCredential({ ...vc, id: "mnd_demoM0" }).ok).toBe(false);
    expect(validateMandateCredential({ ...vc, id: "urn:laisee:mandate:mnd_x" }).ok).toBe(false);
    const mandate = mandateFromCredential(vc);
    expect(mandate.id).toBe("mnd_demoM0");
    expect(validateMandate(mandate).ok).toBe(true);
  });

  it("mandateFromCredential returns a new object and keeps parent only when present", () => {
    const vc = loadFixture("mandate/m0.credential.json", "mandate-credential");
    const frozen = Object.freeze(structuredClone(vc)) as MandateCredential;
    const mandate = mandateFromCredential(frozen);
    expect("parent" in mandate).toBe(false);
    const parent = { mandate_id: "mnd_parent01", mandate_sha256: "0".repeat(64) };
    const withParent = mandateFromCredential({ ...vc, credentialSubject: { ...vc.credentialSubject, parent } });
    expect(withParent.parent).toEqual(parent);
  });
});
