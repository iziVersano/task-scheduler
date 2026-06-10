# Claude Skill: Network Simulation Lab Builder

## Purpose

Extend the current project with a Network Simulation module that allows
users to create and manage a simulated LAN for a building with about 20
neighbors (devices). The module teaches IP addressing, subnetting,
routing, and DHCP concepts.

Claude should analyze the repository structure and integrate the module
without breaking existing functionality.

------------------------------------------------------------------------

## 1. High-Level Goal

Implement a Network Playground where users can:

-   Create a network
-   Select subnet mask / CIDR
-   Generate IP ranges
-   Assign IPs to 20 apartments/devices
-   Visualize the network
-   Simulate communication (ping)

------------------------------------------------------------------------

## 2. Repository Analysis

Before coding:

1.  Scan the project from the root directory
2.  Identify:
    -   frontend framework
    -   state management
    -   routing
    -   UI component patterns
3.  Follow the existing architecture and style

Do NOT rewrite the existing project.

------------------------------------------------------------------------

## 3. Create Module Structure

Example:

src/ modules/ network-lab/ NetworkLabPage.jsx NetworkBuilder.jsx
SubnetCalculator.jsx DeviceManager.jsx NetworkDiagram.jsx
PingSimulator.jsx networkUtils.js networkStore.js

------------------------------------------------------------------------

## 4. Core Concepts

User defines:

Network address Subnet prefix Gateway Device count

Example:

Network: 192.168.10.0 Prefix: /24 Gateway: 192.168.10.1 Devices: 20

------------------------------------------------------------------------

## 5. Subnet Calculation

System calculates:

Network address First host Last host Broadcast Total hosts

Example:

Network: 192.168.10.0 Gateway: 192.168.10.1 Host range: 192.168.10.2 -
192.168.10.254 Broadcast: 192.168.10.255 Available hosts: 254

Logic should be implemented in networkUtils.js.

------------------------------------------------------------------------

## 6. Device Assignment

Simulate 20 apartments.

Example object:

{ id, apartmentNumber, deviceName, ipAddress }

Example mapping:

Apt 1 → 192.168.10.2 Apt 2 → 192.168.10.3 Apt 3 → 192.168.10.4

Support:

-   auto assignment (DHCP simulation)
-   manual IP editing

------------------------------------------------------------------------

## 7. Network Visualization

Example layout:

Internet \| Router (Gateway) \| Switch ├─ Apt1 ├─ Apt2 ├─ Apt3 └─ Apt20

Each node displays:

-   device name
-   IP address

------------------------------------------------------------------------

## 8. Ping Simulation

User selects:

Source IP → Destination IP

Rules:

If same subnet → direct communication If different subnet → routed
through gateway

Visualize the packet path.

------------------------------------------------------------------------

## 9. UI Layout

Add page:

/network-lab

Layout:

-   Network Settings Panel
-   Subnet Calculation Panel
-   Device Table
-   Network Diagram
-   Ping Simulator

------------------------------------------------------------------------

## 10. State Management

Central store should contain:

-   network configuration
-   device list
-   simulation results

Use the existing project state system.

------------------------------------------------------------------------

## 11. Safety

This module must remain a simulation only. No real network commands
should run.

------------------------------------------------------------------------

## 12. Outcome

Users can:

-   design a network
-   assign devices
-   visualize routing
-   understand subnet masks and CIDR
