// The probe host is only worth deploying if it can run a hardware-accelerated
// emulator, and it must not become a public machine while it does. Both are
// template properties, so they are asserted here rather than discovered during
// a paid run.
import { describe, expect, test } from "bun:test";
import type { CloudFormationTemplate, ProbeTemplateOptions } from "./android-preview-template.ts";
import { PROBE_INSTANCE_TYPE, ProbeTemplateError, buildProbeTemplate } from "./android-preview-template.ts";

const AMI = "ami-0abcdef1234567890";

const spec = (overrides: Partial<ProbeTemplateOptions> = {}): CloudFormationTemplate => buildProbeTemplate({ amiId: AMI, ...overrides });

const propertiesOf = (template: CloudFormationTemplate, logicalId: string): Record<string, unknown> => {
  const resource = template.Resources[logicalId];
  if (!resource) throw new Error(`Expected resource ${logicalId} in the generated template`);
  return resource.Properties as Record<string, unknown>;
};

const launchTemplateData = (template: CloudFormationTemplate): Record<string, unknown> =>
  propertiesOf(template, "LaunchTemplate").LaunchTemplateData as Record<string, unknown>;

const instanceProperties = (template: CloudFormationTemplate): Record<string, unknown> => propertiesOf(template, "Instance");

describe("nested virtualization", () => {
  test("the launch template enables it", () => {
    expect(launchTemplateData(spec()).CpuOptions).toEqual({ NestedVirtualization: "enabled" });
  });

  test("an instance family without documented support is refused, not silently deployed", () => {
    expect(() => spec({ instanceType: "t3.large" })).toThrow(ProbeTemplateError);
  });

  test("the default instance type is from a documented family", () => {
    expect(PROBE_INSTANCE_TYPE.split(".")[0]).toBe("m7i");
  });
});

describe("host exposure", () => {
  test("the security group declares no inbound rules", () => {
    const properties = spec().Resources.SecurityGroup?.Properties as { SecurityGroupIngress: unknown[] };
    expect(properties.SecurityGroupIngress).toEqual([]);
  });

  test("measurement needs no open port: SSM replaces SSH", () => {
    const template = spec();
    expect(template.Resources.SsmInstanceProfile).toBeDefined();
    expect(launchTemplateData(template).IamInstanceProfile).toBeDefined();
    expect(launchTemplateData(template)).not.toHaveProperty("KeyName");
  });

  test("IMDSv2 is required, so guest code cannot read instance credentials over IMDSv1", () => {
    expect(launchTemplateData(spec()).MetadataOptions).toMatchObject({ HttpTokens: "required" });
  });

  test("the instance profile is omitted when measurement is disabled", () => {
    const template = spec({ enableSsm: false });
    expect(template.Resources.SsmInstanceProfile).toBeUndefined();
    expect(launchTemplateData(template)).not.toHaveProperty("IamInstanceProfile");
  });
});

describe("cost and teardown behaviour", () => {
  test("a host that shuts itself down stops rather than terminates, so it stays inspectable", () => {
    expect(instanceProperties(spec()).InstanceInitiatedShutdownBehavior).toBe("stop");
  });

  test("the root volume is encrypted and disappears with the instance", () => {
    const mappings = launchTemplateData(spec()).BlockDeviceMappings as Array<{ Ebs: Record<string, unknown> }>;
    expect(mappings).toHaveLength(1);
    expect(mappings[0]?.Ebs).toMatchObject({ Encrypted: true, DeleteOnTermination: true });
  });

  test("an orphaned probe host is attributable from its tags", () => {
    const tags = instanceProperties(spec()).Tags as Array<{ Key: string; Value: string }>;
    expect(tags).toEqual(expect.arrayContaining([{ Key: "proof:component", Value: "android-preview-probe" }]));
  });
});

describe("reproducibility", () => {
  test("a mutable or missing AMI reference is refused", () => {
    expect(() => buildProbeTemplate({ amiId: "" })).toThrow(ProbeTemplateError);
    expect(() => buildProbeTemplate({ amiId: "latest" })).toThrow(ProbeTemplateError);
  });

  test("the pinned AMI reaches the launch template unchanged", () => {
    expect(launchTemplateData(spec()).ImageId).toBe(AMI);
  });

  test("the ids the runner needs are exported", () => {
    expect(Object.keys(spec().Outputs).sort()).toEqual(["InstanceId", "LaunchTemplateId", "SecurityGroupId", "SubnetId"]);
  });
});
