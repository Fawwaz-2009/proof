// CloudFormation template for the Android browser preview probe host.
//
// Why a raw template instead of the ready-made alchemy resources: nested
// virtualization is the entire point of this probe, and it is expressed only
// through `CpuOptions.NestedVirtualization`. Alchemy beta.79's
// `AWS/AutoScaling/LaunchTemplate` props carry no `cpuOptions` (verified against
// the installed types), and `AWS/EC2/Instance` has no field for it either, so
// the template is the supported escape hatch rather than an invented property.
//
// This module is pure on purpose: the template is data, so its shape is
// testable without AWS credentials, and the same builder can be handed to
// CloudFormation validation before anything is launched.

/**
 * Documented starting point for the probe host, overridable with
 * ANDROID_PREVIEW_INSTANCE_TYPE.
 *
 * There is deliberately no default region here. Region decides cost, client
 * latency against the 500 ms budget, and whether the instance family is offered
 * at all, so it is an environment value like every other "where this clone is"
 * setting. See .env.example.
 */
export const PROBE_DEFAULT_INSTANCE_TYPE = "m7i.xlarge";

/**
 * Families AWS documents as supporting nested virtualization, as of 2026-09-20.
 *
 * Verified against AWS's nested virtualization page: general purpose is M7i,
 * M7i-flex, M8i, M8id, M8i-flex, with KVM and Hyper-V as the supported L1
 * hypervisors and no additional cost. The family is checked before launch so a
 * typo cannot silently produce a host without /dev/kvm, which would read as a
 * failed gate for the wrong reason.
 */
export const NESTED_VIRTUALIZATION_FAMILIES = [
  "m7i",
  "m7i-flex",
  "m8i",
  "m8id",
  "m8i-flex",
  "c7i",
  "c7i-flex",
  "c8i",
  "c8id",
  "c8i-flex",
  "r7i",
  "r7iz",
  "r8i",
  "r8id",
  "r8i-flex",
  "x8i",
  "i7i",
  "i7ie",
] as const;

/** Root volume size in GiB. Ephemeral by design: guest state never survives a slot reassignment. */
export const PROBE_ROOT_VOLUME_GB = 50;

/** Loopback-only bridge port. The tunnel forwards here; nothing else may listen publicly. */
export const PROBE_BRIDGE_PORT = 8080;

export interface ProbeTemplateOptions {
  /** Pinned AMI for the target region. Never resolved to "latest": the probe records what it ran. */
  readonly amiId: string;
  /** Region the host runs in, from the environment. Recorded in tags so an orphan is attributable. */
  readonly region: string;
  /** Instance type; must belong to a documented nested virtualization family. */
  readonly instanceType?: string;
  /** Root volume size in GiB. */
  readonly rootVolumeGb?: number;
  /** Whether the host may be reached over SSM for measurement. Defaults to true. */
  readonly enableSsm?: boolean;
  /** Free-form tags merged into every taggable resource. */
  readonly tags?: Record<string, string>;
}

/** A CloudFormation template. Kept as a structural type so the builder has no SDK dependency. */
export type CloudFormationTemplate = {
  AWSTemplateFormatVersion: string;
  Description: string;
  Resources: Record<string, Record<string, unknown>>;
  Outputs: Record<string, { Value: unknown; Description?: string }>;
};

export class ProbeTemplateError extends Error {}

const instanceFamily = (instanceType: string): string => instanceType.split(".")[0] ?? "";

/**
 * Build the probe host template.
 *
 * Security posture, asserted by the tests: no inbound security group rules, SSM
 * instead of SSH for measurement, IMDSv2 required, encrypted root volume, and
 * instance-initiated shutdown stopping the instance rather than terminating it
 * so the probe can inspect a stopped host before deletion.
 */
export const buildProbeTemplate = (options: ProbeTemplateOptions): CloudFormationTemplate => {
  const instanceType = options.instanceType ?? PROBE_DEFAULT_INSTANCE_TYPE;
  const family = instanceFamily(instanceType);
  if (!(NESTED_VIRTUALIZATION_FAMILIES as readonly string[]).includes(family)) {
    throw new ProbeTemplateError(
      `Instance family "${family}" is not documented as supporting nested virtualization. ` + `Supported families: ${NESTED_VIRTUALIZATION_FAMILIES.join(", ")}.`,
    );
  }
  if (!/^ami-[0-9a-f]{8,}$/i.test(options.amiId)) {
    throw new ProbeTemplateError(
      `A pinned AMI id is required (received ${JSON.stringify(options.amiId)}). ` + `Resolve one for the region and pin it; "latest" is not acceptable evidence.`,
    );
  }

  const rootVolumeGb = options.rootVolumeGb ?? PROBE_ROOT_VOLUME_GB;
  if (!Number.isInteger(rootVolumeGb) || rootVolumeGb < 20) {
    throw new ProbeTemplateError(`rootVolumeGb must be an integer of at least 20, received ${rootVolumeGb}.`);
  }

  const enableSsm = options.enableSsm ?? true;
  const tags = {
    "proof:component": "android-preview-probe",
    "proof:disposable": "true",
    "proof:region": options.region,
    ...options.tags,
  };
  const tagList = Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));

  const resources: Record<string, Record<string, unknown>> = {
    Vpc: {
      Type: "AWS::EC2::VPC",
      Properties: {
        CidrBlock: "10.42.0.0/16",
        EnableDnsSupport: true,
        EnableDnsHostnames: true,
        Tags: [...tagList, { Key: "Name", Value: "android-preview-probe-vpc" }],
      },
    },
    InternetGateway: {
      Type: "AWS::EC2::InternetGateway",
      Properties: { Tags: tagList },
    },
    GatewayAttachment: {
      Type: "AWS::EC2::VPCGatewayAttachment",
      Properties: {
        VpcId: { Ref: "Vpc" },
        InternetGatewayId: { Ref: "InternetGateway" },
      },
    },
    Subnet: {
      Type: "AWS::EC2::Subnet",
      Properties: {
        VpcId: { Ref: "Vpc" },
        CidrBlock: "10.42.1.0/24",
        MapPublicIpOnLaunch: true,
        Tags: [...tagList, { Key: "Name", Value: "android-preview-probe-subnet" }],
      },
    },
    RouteTable: {
      Type: "AWS::EC2::RouteTable",
      Properties: { VpcId: { Ref: "Vpc" }, Tags: tagList },
    },
    DefaultRoute: {
      Type: "AWS::EC2::Route",
      DependsOn: "GatewayAttachment",
      Properties: {
        RouteTableId: { Ref: "RouteTable" },
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: { Ref: "InternetGateway" },
      },
    },
    SubnetRouteTableAssociation: {
      Type: "AWS::EC2::SubnetRouteTableAssociation",
      Properties: { SubnetId: { Ref: "Subnet" }, RouteTableId: { Ref: "RouteTable" } },
    },
    // Outbound only. Measurement happens over SSM; the bridge is reached through
    // the tunnel, which dials out from the host, so no inbound rule is needed at
    // any point and none is declared.
    SecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupDescription: "Android preview probe: egress only, no inbound rules",
        VpcId: { Ref: "Vpc" },
        SecurityGroupIngress: [],
        SecurityGroupEgress: [{ IpProtocol: "-1", CidrIp: "0.0.0.0/0", Description: "outbound only" }],
        Tags: tagList,
      },
    },
  };

  const instanceProfile: Record<string, unknown>[] = [];
  if (enableSsm) {
    resources.SsmRole = {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ec2.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        ManagedPolicyArns: ["arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"],
        Tags: tagList,
      },
    };
    resources.SsmInstanceProfile = {
      Type: "AWS::IAM::InstanceProfile",
      Properties: { Roles: [{ Ref: "SsmRole" }] },
    };
    instanceProfile.push({ Ref: "SsmInstanceProfile" });
  }

  resources.LaunchTemplate = {
    Type: "AWS::EC2::LaunchTemplate",
    Properties: {
      LaunchTemplateName: "android-preview-probe-host",
      LaunchTemplateData: {
        ImageId: options.amiId,
        InstanceType: instanceType,
        // The whole reason this template exists.
        CpuOptions: { NestedVirtualization: "enabled" },
        // The subnet and the security group have to be declared together here.
        // A launch template without a subnet places the instance in the
        // account's default VPC, and the launch then fails with "security group
        // and subnet belong to different networks", which is exactly what the
        // first Singapore run did.
        NetworkInterfaces: [
          {
            DeviceIndex: 0,
            SubnetId: { Ref: "Subnet" },
            Groups: [{ Ref: "SecurityGroup" }],
            AssociatePublicIpAddress: true,
          },
        ],
        MetadataOptions: { HttpTokens: "required", HttpEndpoint: "enabled", HttpPutResponseHopLimit: 1 },
        BlockDeviceMappings: [
          {
            DeviceName: "/dev/xvda",
            Ebs: {
              VolumeSize: rootVolumeGb,
              VolumeType: "gp3",
              Encrypted: true,
              DeleteOnTermination: true,
            },
          },
        ],
        ...(instanceProfile.length > 0 ? { IamInstanceProfile: { Arn: { "Fn::GetAtt": ["SsmInstanceProfile", "Arn"] } } } : {}),
        TagSpecifications: [
          { ResourceType: "instance", Tags: tagList },
          { ResourceType: "volume", Tags: tagList },
        ],
      },
      TagSpecifications: [{ ResourceType: "launch-template", Tags: tagList }],
    },
  };

  resources.Instance = {
    Type: "AWS::EC2::Instance",
    DependsOn: "SubnetRouteTableAssociation",
    Properties: {
      LaunchTemplate: { LaunchTemplateId: { Ref: "LaunchTemplate" }, Version: { "Fn::GetAtt": ["LaunchTemplate", "LatestVersionNumber"] } },
      // A probe host that shuts itself down must stop, not terminate: the
      // instance has to be inspectable after the watchdog acts.
      InstanceInitiatedShutdownBehavior: "stop",
      Tags: [...tagList, { Key: "Name", Value: "android-preview-probe-host" }],
    },
  };

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Disposable Android preview probe host: nested virtualization enabled, egress-only networking, SSM for measurement.",
    Resources: resources,
    Outputs: {
      InstanceId: { Value: { Ref: "Instance" }, Description: "Probe host instance id" },
      LaunchTemplateId: { Value: { Ref: "LaunchTemplate" }, Description: "Launch template carrying the CPU options" },
      SecurityGroupId: { Value: { Ref: "SecurityGroup" }, Description: "Egress-only security group" },
      SubnetId: { Value: { Ref: "Subnet" }, Description: "Public subnet used by the probe host" },
    },
  };
};
