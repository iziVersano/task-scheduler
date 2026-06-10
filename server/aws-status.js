const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const { EC2Client, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeRouteTablesCommand, DescribeInternetGatewaysCommand, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');
const { S3Client, ListBucketsCommand, GetBucketLocationCommand, GetBucketAclCommand, GetBucketPolicyStatusCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
const { GuardDutyClient, ListDetectorsCommand, GetDetectorCommand } = require('@aws-sdk/client-guardduty');
const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
const { IAMClient, GetAccountSummaryCommand, ListUsersCommand, ListGroupsCommand, ListRolesCommand, ListPoliciesCommand, ListGroupsForUserCommand, GetLoginProfileCommand } = require('@aws-sdk/client-iam');

const cfg = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// Cost Explorer must always use us-east-1
const ceCfg = { ...cfg, region: 'us-east-1' };

async function getEC2() {
  const client = new EC2Client(cfg);
  const res = await client.send(new DescribeInstancesCommand({}));
  const instances = res.Reservations.flatMap(r => r.Instances);
  const counts = { running: 0, stopped: 0, other: 0 };
  for (const i of instances) {
    const s = i.State.Name;
    if (s === 'running') counts.running++;
    else if (s === 'stopped') counts.stopped++;
    else counts.other++;
  }
  return { total: instances.length, ...counts, instances: instances.map(i => ({
    id: i.InstanceId,
    type: i.InstanceType,
    state: i.State.Name,
    name: i.Tags?.find(t => t.Key === 'Name')?.Value || '—',
    az: i.Placement?.AvailabilityZone,
    launched: i.LaunchTime,
    publicIp: i.PublicIpAddress || null,
    privateIp: i.PrivateIpAddress || null,
    imageId: i.ImageId,
  })) };
}

async function getS3() {
  const client = new S3Client(cfg);
  const res = await client.send(new ListBucketsCommand({}));
  const buckets = await Promise.all(res.Buckets.map(async b => {
    const [locationRes, aclRes, policyRes] = await Promise.allSettled([
      client.send(new GetBucketLocationCommand({ Bucket: b.Name })),
      client.send(new GetBucketAclCommand({ Bucket: b.Name })),
      client.send(new GetBucketPolicyStatusCommand({ Bucket: b.Name })),
    ]);
    const region = locationRes.status === 'fulfilled'
      ? (locationRes.value.LocationConstraint || 'us-east-1') : null;
    const isPublic = policyRes.status === 'fulfilled'
      ? policyRes.value.PolicyStatus?.IsPublic : false;
    const acl = aclRes.status === 'fulfilled'
      ? (aclRes.value.Grants?.some(g => g.Grantee?.URI?.includes('AllUsers')) ? 'public' : 'private')
      : 'unknown';
    return { name: b.Name, created: b.CreationDate, region, acl, isPublic: isPublic || false };
  }));
  return { total: res.Buckets.length, buckets };
}

async function getEBS() {
  const client = new EC2Client(cfg);
  const res = await client.send(new DescribeVolumesCommand({}));
  return {
    total: res.Volumes.length,
    volumes: res.Volumes.map(v => ({
      id: v.VolumeId,
      name: v.Tags?.find(t => t.Key === 'Name')?.Value || '—',
      state: v.State,
      type: v.VolumeType,
      sizeGb: v.Size,
      az: v.AvailabilityZone,
      encrypted: v.Encrypted,
      kmsKeyId: v.KmsKeyId || null,
      iops: v.Iops || null,
      throughput: v.Throughput || null,
      multiAttach: v.MultiAttachEnabled || false,
      snapshotId: v.SnapshotId || null,
      created: v.CreateTime,
      attachments: v.Attachments?.map(a => ({
        instanceId: a.InstanceId,
        device: a.Device,
        state: a.State,
        attachTime: a.AttachTime,
        deleteOnTermination: a.DeleteOnTermination,
      })) || [],
    })),
  };
}

async function getVPC() {
  const client = new EC2Client(cfg);
  const [vpcsRes, subnetsRes, routesRes, igwRes] = await Promise.all([
    client.send(new DescribeVpcsCommand({})),
    client.send(new DescribeSubnetsCommand({})),
    client.send(new DescribeRouteTablesCommand({})),
    client.send(new DescribeInternetGatewaysCommand({})),
  ]);

  const vpcs = vpcsRes.Vpcs.map(v => {
    const subnets = subnetsRes.Subnets.filter(s => s.VpcId === v.VpcId);
    const routeTables = routesRes.RouteTables.filter(r => r.VpcId === v.VpcId);
    const igw = igwRes.InternetGateways.find(i => i.Attachments?.some(a => a.VpcId === v.VpcId));
    return {
      id: v.VpcId,
      cidr: v.CidrBlock,
      isDefault: v.IsDefault,
      state: v.State,
      name: v.Tags?.find(t => t.Key === 'Name')?.Value || '—',
      subnets: subnets.map(s => ({
        id: s.SubnetId,
        cidr: s.CidrBlock,
        az: s.AvailabilityZone,
        public: s.MapPublicIpOnLaunch,
        available: s.AvailableIpAddressCount,
        name: s.Tags?.find(t => t.Key === 'Name')?.Value || '—',
      })),
      routeTables: routeTables.map(r => ({
        id: r.RouteTableId,
        main: r.Associations?.some(a => a.Main),
        routes: r.Routes?.map(ro => ({
          destination: ro.DestinationCidrBlock || ro.DestinationIpv6CidrBlock,
          target: ro.GatewayId || ro.NatGatewayId || ro.InstanceId || ro.TransitGatewayId || 'local',
          state: ro.State,
        })),
      })),
      internetGateway: igw ? { id: igw.InternetGatewayId, state: igw.Attachments?.[0]?.State } : null,
    };
  });

  return { total: vpcs.length, vpcs };
}

async function getLambda() {
  const client = new LambdaClient(cfg);
  const res = await client.send(new ListFunctionsCommand({ MaxItems: 50 }));
  return {
    total: res.Functions.length,
    functions: res.Functions.map(f => ({
      name: f.FunctionName,
      runtime: f.Runtime,
      memory: f.MemorySize,
      timeout: f.Timeout,
      modified: f.LastModified,
    })),
  };
}

async function getGuardDuty() {
  const client = new GuardDutyClient(cfg);
  const list = await client.send(new ListDetectorsCommand({}));
  if (!list.DetectorIds.length) return { enabled: false };
  const det = await client.send(new GetDetectorCommand({ DetectorId: list.DetectorIds[0] }));
  return {
    enabled: det.Status === 'ENABLED',
    status: det.Status,
    detectorId: list.DetectorIds[0],
    updatedAt: det.UpdatedAt,
  };
}

async function getBilling() {
  const client = new CostExplorerClient(ceCfg);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  // end must be different from start
  if (start === end) return { amount: '0.00', unit: 'USD', start, end };
  const res = await client.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: start, End: end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
  }));
  const amount = res.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount || '0';
  const unit = res.ResultsByTime?.[0]?.Total?.UnblendedCost?.Unit || 'USD';
  return { amount: parseFloat(amount).toFixed(4), unit, start, end };
}

async function getNginx() {
  const key = process.env.EC2_SSH_KEY_PATH || `${process.env.HOME}/lab-key.pem`;
  const host = process.env.EC2_HOST || '3.87.87.182';
  const user = process.env.EC2_USER || 'ec2-user';
  try {
    const out = execSync(
      `ssh -i ${key} -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${host} "systemctl is-active nginx && systemctl show nginx --property=ActiveEnterTimestamp,MainPID | tr '\\n' '|'"`,
      { timeout: 10000 }
    ).toString().trim();
    const [active, props] = out.split('\n');
    const pid = props?.match(/MainPID=(\d+)/)?.[1];
    const ts = props?.match(/ActiveEnterTimestamp=([^|]+)/)?.[1]?.trim();
    return { running: active === 'active', status: active, since: ts || null, pid: pid || null, host };
  } catch (e) {
    return { running: false, status: 'unreachable', error: e.message.slice(0, 120), host };
  }
}

async function getIAM() {
  const client = new IAMClient(cfg);
  const [summary, users, groups, roles, policies] = await Promise.all([
    client.send(new GetAccountSummaryCommand({})),
    client.send(new ListUsersCommand({ MaxItems: 20 })),
    client.send(new ListGroupsCommand({ MaxItems: 20 })),
    client.send(new ListRolesCommand({ MaxItems: 20 })),
    client.send(new ListPoliciesCommand({ Scope: 'Local', MaxItems: 20 })),
  ]);

  // Fetch extra details per user: groups + console access
  const userList = await Promise.all(users.Users.map(async u => {
    const [groupsRes, loginRes] = await Promise.allSettled([
      client.send(new ListGroupsForUserCommand({ UserName: u.UserName })),
      client.send(new GetLoginProfileCommand({ UserName: u.UserName })),
    ]);
    return {
      name: u.UserName,
      created: u.CreateDate,
      lastLogin: u.PasswordLastUsed || null,
      consoleAccess: loginRes.status === 'fulfilled',
      groups: groupsRes.status === 'fulfilled'
        ? groupsRes.value.Groups.map(g => g.GroupName)
        : [],
    };
  }));

  const s = summary.SummaryMap;
  return {
    users: s.Users,
    groups: s.Groups,
    roles: s.Roles,
    policies: s.Policies,
    mfaDevices: s.MFADevices,
    accountMfaEnabled: s.AccountMFAEnabled === 1,
    userList,
    groupList: groups.Groups.map(g => ({
      name: g.GroupName,
      created: g.CreateDate,
      path: g.Path,
    })),
    roleList: roles.Roles.map(r => ({
      name: r.RoleName,
      created: r.CreateDate,
      lastUsed: r.RoleLastUsed?.LastUsedDate || null,
      lastUsedRegion: r.RoleLastUsed?.Region || null,
      description: r.Description || null,
    })),
    policyList: policies.Policies.map(p => ({
      name: p.PolicyName,
      attached: p.AttachmentCount,
      created: p.CreateDate,
      updated: p.UpdateDate,
      description: p.Description || null,
    })),
  };
}

// Cache results for 60 seconds to avoid hammering AWS API
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

router.get('/aws-status', async (_req, res) => {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL) {
      return res.json({ ...cache, cached: true });
    }

    const [ec2, s3, lambda, guardduty, billing, iam, vpc, nginx, ebs] = await Promise.allSettled([
      getEC2(), getS3(), getLambda(), getGuardDuty(), getBilling(), getIAM(), getVPC(), getNginx(), getEBS(),
    ]);

    const result = {
      timestamp: new Date().toISOString(),
      cached: false,
      ec2:        ec2.status        === 'fulfilled' ? ec2.value        : { error: ec2.reason?.message },
      s3:         s3.status         === 'fulfilled' ? s3.value         : { error: s3.reason?.message },
      lambda:     lambda.status     === 'fulfilled' ? lambda.value     : { error: lambda.reason?.message },
      guardduty:  guardduty.status  === 'fulfilled' ? guardduty.value  : { error: guardduty.reason?.message },
      billing:    billing.status    === 'fulfilled' ? billing.value    : { error: billing.reason?.message },
      iam:        iam.status        === 'fulfilled' ? iam.value        : { error: iam.reason?.message },
      vpc:        vpc.status        === 'fulfilled' ? vpc.value        : { error: vpc.reason?.message },
      nginx:      nginx.status      === 'fulfilled' ? nginx.value      : { error: nginx.reason?.message },
      ebs:        ebs.status        === 'fulfilled' ? ebs.value        : { error: ebs.reason?.message },
    };

    cache = result;
    cacheTime = Date.now();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
