###### Topics

Shared Responsibility Model

- Understanding the concept of shared responsibility between cloud provider and customer
- Examples of responsibilities in security, compliance, and operations

IaaS (Infrastructure as a Service)

- Definition and key characteristics of IaaS
- Common use cases for IaaS

PaaS (Platform as a Service)

- Definition and key characteristics of PaaS
- Benefits and limitations of using PaaS

SaaS (Software as a Service)

- Definition and key characteristics of SaaS
- Everyday examples of SaaS applications


# 🎯 Shared Responsibility Model

The Shared Responsibility Model explains who is responsible for what in the cloud: the cloud provider (Cloud Service Provider, or CSP) and you as the customer. Simply put: The provider ensures that the cloud itself is secure and functional (security of the cloud), and you ensure that everything you use and configure in the cloud is correctly protected and operated (security in the cloud).

Imagine a rental apartment: The landlord takes care of the building, electricity, elevators, and main entrance locks. You decide who gets your apartment key, what furniture you put in, and whether you leave the window open. The division of responsibility in the cloud works the same way. Therefore, you know which tasks you must actively manage—such as managing access, encrypting data, setting up backups—and what the provider secures by default, like data centers, network infrastructure, and hardware.


## 🧭 Basic Principle: Who does what?

The cloud provider is responsible for the security and functionality of the cloud platform: buildings, power supply, physical security, networks, server hardware, the virtualization layer, and the managed platform services.

You are responsible for everything you deploy or configure on this platform: your data, identities and access (Identity and Access Management, or IAM), network rules, encryption settings, system and application configurations, as well as your operational tasks like monitoring, backups, and incident response.

The boundary shifts depending on the service model. The “higher” the service (for example, Software as a Service), the more the provider assumes—and the more you focus on data, users, and configurations.


## 🧱 Service Models and the Boundary of Responsibility

### IaaS – Infrastructure as a Service
With IaaS, you get building blocks like virtual machines (VMs), networks, and storage. The provider secures the data center, hardware, and virtualization. You manage the operating system (OS), patches, VM-level firewalls, installed software, data, and access. Example: You patch the VM and set up security groups and disk encryption.

### PaaS – Platform as a Service
With PaaS, the provider delivers the runtime environment, such as databases or container platforms. The provider patches the OS and runtime. You are responsible for schemas, queries, user permissions, network exposures, encryption keys, and backups/lifecycles within the service. Example: In a managed database, you set roles, password policies, and backup retention.

### SaaS – Software as a Service
With SaaS, the provider operates the entire application. You manage users, roles, data classification, configuration (for example, sharing policies), and sometimes device or location rules. Example: In a SaaS office suite, you define who can share externally and how long data is retained.


## 🔐 Examples: Responsibilities in Security

Security is the area where shared responsibility is most visible. The provider delivers the security foundation; you use it properly and supplement it as needed.

### Provider Side: Security of the Cloud
The provider protects data centers (access controls, video surveillance), hardware (servers, storage, network devices), core networks, the virtualization layer (hypervisor), and the managed services themselves. They provide security features such as encryption at rest and in transit, key management services, web application firewalls, DDoS protection, identity services, and security protocols. They also ensure patching and hardening of their platform components.

### Customer Side: Security in the Cloud
You manage who can access what (Identity and Access Management, or IAM), enforce strong authentication (such as multi-factor authentication), set network rules (security groups, firewalls), configure encryption (activate it, choose keys, plan rotations), and protect your workloads (for example, OS patching in IaaS, secure container images, secrets like passwords or tokens in a secret store). You enable logging (audit logs), track changes (configuration monitoring), set up alerts, and respond to security events.

A typical example is a storage bucket: The provider guarantees durability and physical security. You decide whether the bucket is public or private, which encryption is active, and who can read or write. Misconfigurations on your side (e.g., "publicly writable") remain your responsibility.


## 📜 Examples: Responsibilities in Compliance

Compliance means adhering to laws, standards, and internal policies, such as GDPR, ISO/IEC 27001, or Payment Card Industry Data Security Standard (PCI DSS). There are typically three layers: the provider, you, and shared controls.

### Provider Side: Platform Compliance
The provider regularly audits and certifies their platform, provides audit reports, and observes technical minimum standards (for example, encryption strengths, data center standards). They offer regions and zones to control data location and supply contract components like data processing agreements.

### Customer Side: Compliant Usage
You are responsible for ensuring your specific use is compliant: data classification (which data may go where), region selection (data residency), retention periods, deletion concepts, access separation (need-to-know), logging, and evidence collection. You define policies in the services (e.g., password rules, export/sharing rules), conduct your own audits, and document processes.

### Shared Controls
Certain controls are shared: The provider delivers features (e.g., encryption, key management, logging), you activate and operate them properly (e.g., use customer-managed keys, observe rotation cycles, retain and analyze logs). If, for example, encryption is not enabled or keys are managed insecurely, this is a customer-side gap—even though the provider feature exists.


## ⚙️ Examples: Responsibilities in Operations

Operations include availability, performance, cost, changes, and incidents. The provider ensures that the service runs; you ensure that your application is stable, observable, and restorable.

### Provider Side: Platform Operations
The provider assures the availability of their services per a Service Level Agreement (SLA), scales the platform, carries out maintenance, and resolves platform incidents. They provide metrics, logs, and interfaces so you can monitor. They also offer backup or snapshot features in managed services.

### Customer Side: Application Operations
You design architecture for fault tolerance (for example, using multiple zones/regions, load balancing), activate backups and test restores, set up monitoring, metrics, and alerts, define runbooks for incidents, and manage capacity and costs. In IaaS, you patch operating systems and middleware yourself; in PaaS/SaaS, you are responsible for changes to schemas, configurations, and feature flags. Secure deployment (e.g., via automated pipelines) is also your responsibility.

### Concrete Mini-Scenarios
In a managed database (PaaS), the provider takes care of OS patches and service availability. You set maintenance windows, backup schedules, access controls, and network exposures, and check whether restores meet your recovery time and point objectives.

In an IaaS VM, the provider supplies host security and network infrastructure. You install security updates, harden the OS, configure the host firewall, deploy a monitoring agent, and manage secrets securely.

In a SaaS application, the provider ensures app availability and data storage. You define roles, multi-factor sign-in, data retention rules, export/sharing policies, and regularly review audit logs for suspicious activity.

# ☁️ IaaS (Infrastructure as a Service)

IaaS, or Infrastructure as a Service, means renting the fundamental building blocks of a data center—compute (servers), storage, and network—from the cloud instead of buying and running your own hardware. You receive virtual machines (VMs, virtual servers), disks, networks, and security features at the push of a button or via an API (Application Programming Interface). You usually pay per use (“pay-as-you-go”) and can add or remove resources flexibly. The cloud provider handles the physical hardware, power, cooling, and the hypervisor (the virtualization layer). You manage what runs on top: operating system (OS), patches, runtimes, databases, and applications.

A helpful analogy: IaaS is like an empty, ready-to-move-in apartment. The landlord handles the building, water, electricity, and the building’s security. You furnish the apartment, choose the furniture (OS and software), and decide who gets a key (access rights). By comparison, Platform as a Service (PaaS) is like a fully equipped kitchen where you only have to cook, and Software as a Service (SaaS) is like a restaurant where the ready meal is served to you.


## 📘 Definition and Key Characteristics of IaaS

IaaS provides you with the fundamental IT building blocks on demand. “On demand” means you start, stop, and change resources exactly when you need them—often automated via an API or web interface. This makes you agile and independent of hardware procurement and long delivery times.

Key features show why this is relevant for you as a sysadmin. You get virtual machines (VMs) with freely selectable sizes for CPU (processor power), RAM (memory), and optionally GPU (for compute-intensive workloads). Storage choices are flexible: block storage (like virtual disks for VMs), object storage (cheap and scalable for files, backups, logs), and file storage (network shares). You can logically separate networks, for example, into a Virtual Private Cloud (VPC, virtual isolated network), with subnets, routing tables, security groups, and firewalls. This keeps systems separated, and you control precisely which port is open and who can talk to whom.

Scaling is built-in: You can scale your environment horizontally (more VMs) or vertically (larger VM types). With autoscaling, you react to load spikes without overprovisioning permanently. Billing is usage-based and transparent: measured per hour or second for compute, per gigabyte for storage, and per gigabyte for network traffic. Service Level Agreements (SLA, guaranteed availabilities) give you legal reliability, such as operations in multiple availability zones (physically separated data centers) within a region.

Security and access control are integral: With Identity and Access Management (IAM), you define who can see or modify resources, and with keys and certificates you secure data at rest and in transit. With snapshots and images (OS templates) you can quickly clone or restore VMs. All this is API-controllable, enabling Infrastructure as Code (IaC): you describe your environment in files and build it reproducibly—like a construction manual.

A minimalist example makes this clear. Below is a short Terraform definition that creates a small VM in a region. Terraform is a popular IaC tool and talks to the cloud provider’s API.

```hcl
# Terraform: highly simplified example for a small VM in the cloud
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-central-1"  # Region, e.g., Frankfurt
}

resource "aws_instance" "demo" {
  ami           = "ami-xxxxxxxx"   # Placeholder: image ID (OS template)
  instance_type = "t3.micro"       # Small, inexpensive VM size
  tags = { Name = "demo" }
}
```

The same principle works directly via the command line. A single line can start a VM—demonstrating the power of API-based self service:

```bash
# Example using AWS CLI: launches a small VM (image ID is placeholder)
aws ec2 run-instances \
  --image-id ami-xxxxxxxx \
  --instance-type t3.micro \
  --count 1 \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=demo}]'
```

The role model (“Shared Responsibility”) is crucial: The cloud provider is responsible for the data center, hardware, physical security, and the virtualization layer. You are responsible for the operating system, patches, configuration, encryption at OS and application layer, network security within your VPC, and of course your data and applications.


## 🚀 Common Use Cases for IaaS

A classic starting point is “lift-and-shift”: You take existing applications currently running on physical servers or old virtualization farms and move them almost unchanged onto VMs in the cloud. You gain flexibility and skip hardware refresh cycles without needing to adapt code immediately.

Development and test environments are very popular. Dev teams start VMs and databases only for the duration of a sprint or a test and shut them off afterwards. This saves costs and accelerates experimentation. With images and IaC, an identical test environment can be reproduced in minutes—no more “works on my laptop” issues.

Web applications with fluctuating load benefit from elastic scaling. If more users are active at night or a campaign brings high traffic, you automatically start additional VMs behind a load balancer (traffic distributor). During quiet times, you scale down. Performance stays stable and the bill fair.

Disaster recovery is a powerful safety net with IaaS. You hold backups and machine images in a second region, and can start your workloads there if outages occur. Recovery time is greatly reduced without operating two physical data centers. Similarly, it’s ideal for backup and archiving: object storage is a cheap, durable location for backups and logs.

Large-scale data processing—analytics, machine learning, batch jobs, or rendering—fits IaaS well. You spin up hundreds of VMs for a night to crunch through a data batch and then release the resources. Special VM types with lots of RAM, fast NVMe disks, or GPUs are available for particular needs. This means you get power when you need it, without maintaining computing clusters continuously.

Another use case is full control for compliance or special reasons. For example, you run a database in your own VMs because you need to control OS settings, patches, encryption, or auditing as per requirements. Similarly, you can operate network security components like virtual firewalls, VPN gateways, or intrusion detection systems in a VPC to build cross-location networks or finely tune access.

Temporary lab and training environments are also efficient to provide. You spin up dozens of identical VMs for a training, distribute credentials, and then remove the environment without leaving a trace. This reduces effort and costs, and all participants work in a consistent environment.

These scenarios show IaaS’s core benefit: you get the freedom and speed of the cloud but keep control down to the operating system—ideal if you need flexibility without being bound to rigid platform rules.


# 🎯 PaaS (Platform as a Service)

PaaS, Platform as a Service, is a cloud service where you focus almost entirely on your code, while the provider handles the underlying technology. Imagine you want to publish a web app: With traditional infrastructure, you manage servers, OS, updates, security patches, runtimes, and scaling. With PaaS, you only supply the code, and the platform ensures it’s built, started, monitored, and scaled as needed. It’s a kind of "ready-made stage" where your application runs—complete with lighting, sound, and tech—and you focus on the play itself.

PaaS is between Infrastructure as a Service (IaaS) and Software as a Service (SaaS). With IaaS you still manage a lot yourself (VMs, networks, OS), with SaaS you use ready-made applications. PaaS gives you a runtime and service platform: you deliver applications, the platform operates them.


## 🧭 Definition and Key Characteristics

A PaaS is a managed environment delivering runtimes (e.g., Java, Python, Node.js), web servers, build and deployment functions, databases, and other application services. You control your application and data; the provider manages server hardware, virtualization, OS, security updates, and often the automatic scaling up and down.

PaaS typically simplifies the path from code to running app. Often, an upload or automated build from your code repo is enough. The platform identifies the required runtime, installs dependencies, starts the app in standardized containers or isolated environments, and connects it with networking, storage, and logging.

PaaS environments are usually “opinionated,” meaning they give you proven conventions: how logs are collected, how configuration works via environment variables, how database connections are set up, and how scaling operates. This reduces complexity and misconfiguration. At the same time, it means less freedom to customize the system in detail.

Separation of configuration and code is key. Settings like database URL, credentials, or the port to use are provided via environment variables. This keeps your code portable, and the platform can standardize how it starts and scales app instances.

A simple example shows how a basic web app is designed to run well on PaaS. The critical point is that the port comes from an environment variable and the app is "reachable from outside":

```python
# app.py
from flask import Flask
import os

app = Flask(__name__)

@app.route("/")
def index():
    return "Hello from my PaaS app!"

if __name__ == "__main__":
    # In PaaS environments, PORT is usually set by the platform
    port = int(os.environ.get("PORT", 5000))
    # 0.0.0.0 ensures the app is reachable from the outside
    app.run(host="0.0.0.0", port=port)
```

With this structure, the platform can start the app in multiple instances, distribute requests, collect logs, and update the runtime in the background—without you having to manage the system.


## ⚖️ Advantages and Limitations

The biggest advantage of PaaS is focus on what matters: you develop features, not manage servers. Typical routine tasks like OS security updates, scaling logic, monitoring, and logging are handled by the platform. This gets you from idea to running application faster. Especially for web applications, APIs, and microservices, PaaS accelerates delivery. Tools for continuous integration/delivery (CI/CD), metrics, alerts, and centralized log collection are often integrated. This makes operations easier and improves stability. Costs are usually usage-based, so you can start small and scale up as needed.

These benefits come with some limitations. You give up control: deep system customizations, special kernel modules, or root access are usually not possible. You adapt to the supported runtime versions, build processes, and network models of the platform. While this simplifies operations, it may result in vendor lock-in. Applications should be stateless—no local, permanent files; persistent data belongs in platform-provided services like databases or object storage. Some network or security requirements, such as very granular routing or compliance policies, may only be partially possible in standard PaaS environments. Costs can also rise with high load if many instances, add-ons, or larger plans are needed.

If you want to deploy an application quickly, reliably, and without deep infrastructure expertise, PaaS is often the right choice. If you need very specific system requirements or maximum control over the OS and network, a solution closer to IaaS or your own container orchestration may be more appropriate.


# 🎯 SaaS (Software as a Service)

SaaS (Software as a Service) means using ready-made software via the Internet rather than installing it on your own computer or server. You typically use it through a web browser or an app, log in, and can start working immediately. The provider operates the application, handles updates, security, scaling, and availability. Normally, you pay a subscription, for example per user per month, similar to a magazine subscription.

SaaS as an analogy: It’s like renting a fully furnished apartment. You move in and use everything right away. Repairs, hall cleaning, and renovations are handled by the landlord. You focus on using the space—not on building or maintaining it.

SaaS differs from other cloud models: With IaaS, you rent building blocks such as servers and storage and have to install and maintain much yourself. With PaaS, you get a development platform to build your own applications. SaaS delivers the finished application—immediately usable, no installation, no server operation.


## 🧩 Definition and Key Characteristics of SaaS

SaaS is application software operated by the provider, which you use over the Internet. The key characteristics can be easily understood via day-to-day experience:

- Access via browser or app: Usually all you need is Internet and a current browser. This makes you device-independent—laptop, tablet, smartphone, or office PC make little difference.

- Subscription instead of purchase: Rather than a one-time license, you pay monthly or annually. This lowers entry costs and makes expenses predictable.

- Updates without hassle: New features, bug fixes, and security patches arrive automatically. No installers, no maintenance windows to plan.

- Provider operates and scales: Load spikes (e.g., more users or large files) are handled by the provider scaling in the cloud. No need for you to buy more hardware.

- Multi-tenancy: Many customers use the same software instance, but their data stays strictly separate. This lets providers share resources efficiently, simplifying costs and maintenance.

- Availability and service level: Reliability is often governed by a Service Level Agreement (SLA), e.g., a guaranteed uptime.

- Security as shared responsibility: The provider handles a lot (e.g., data center security, encryption, backups). You’re responsible for things like strong passwords, roles and permissions, and granting access. Providers often support Single Sign-On (SSO) and multifactor authentication.

- Configuration, not development: You usually adapt software through settings (forms, fields, workflows), not by programming it. Extension is often via apps or APIs to other services.

- Data management and compliance: The provider stores data in data centers, often with regional options (e.g., EU). Privacy and compliance are central topics, and reputable providers offer retention, export, and deletion functions.

- Offline capability depending on the product: Some SaaS applications offer a limited offline mode with later synchronization; others only work with Internet access.

In short: SaaS handles operation, maintenance, and scaling for you and delivers an instantly usable, always up-to-date application over the Internet.


## 🏡 Everyday Examples of SaaS Applications

SaaS is likely part of your daily life—both personally and at work. Many familiar services are classic examples:

Email and calendar: Webmail services like Gmail or Outlook.com. You log in via browser and manage emails, contacts, and appointments with no local installation.

Office and collaboration: Online word processing, spreadsheets, and presentations like Microsoft 365 or Google Workspace allow real-time co-authoring. You see what colleagues type live, and no more shuffling files back and forth.

File storage and sharing: Dropbox, OneDrive, and Google Drive store documents in the cloud. Access from anywhere. Share folders, and changes are synced automatically.

Chat, meetings, and video conferencing: Slack, Microsoft Teams, or Zoom connect teams via chat, audio, and video. Updates arrive continually with no installs required.

Project and task management: Trello, Asana, or Jira help plan tasks, assign responsibilities, and track progress—all in the browser.

Customer data and sales (CRM): Salesforce or HubSpot store customer data, appointments, and sales opportunities centrally and provide analytics and automation.

Accounting and finance: lexoffice, sevDesk, or Xero enable invoices, receipts, banking reconciliation, and reports online—ideal for freelancers and small businesses.

Helpdesk and support: Zendesk or Freshdesk consolidate requests from email, chat, and phone into one system, including knowledgebase and reporting.

Marketing and newsletters: Mailchimp or CleverReach create campaigns, manage distribution lists, and measure open and click rates—no mail server needed.

E-commerce platforms: Shopify offers a complete online shop as a service, with product catalog, payments, and shipping integration, no need to run your own shop software.

Password management: 1Password or LastPass store passwords encrypted in the cloud and autofill them in the browser—on all your devices.

Even streaming services for music or movies work similarly (you use a finished app over the Internet), but are more "content streaming" than classic business software. For understanding SaaS, the key point is: you use a fully managed app directly from the cloud, with no need for installation, servers, or updates.