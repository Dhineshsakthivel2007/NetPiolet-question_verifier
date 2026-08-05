import React from 'react';

/**
 * Authentic Cisco Packet Tracer 3D Device SVG Icons
 */

// 1. Cisco 3D Router (Cyan Cylinder with 4 White Arrows on Top)
export const RouterCiscoIcon = ({ width = 90, height = 70 }) => (
<svg
    width={width}
    height={height}
    viewBox="0 0 120 90"
    xmlns="http://www.w3.org/2000/svg"
>

    <defs>
        {/* Top */}
        <linearGradient id="top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D8EEF5"/>
            <stop offset="55%" stopColor="#A5D7E8"/>
            <stop offset="100%" stopColor="#6CAFC7"/>
        </linearGradient>

        {/* Side */}
        <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2F8EA8"/>
            <stop offset="100%" stopColor="#0B5E79"/>
        </linearGradient>

        {/* Front Highlight */}
        <linearGradient id="front" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4AA9C8"/>
            <stop offset="50%" stopColor="#E8FAFF"/>
            <stop offset="100%" stopColor="#2A86A4"/>
        </linearGradient>
    </defs>

    {/* Shadow */}
    <ellipse
        cx="60"
        cy="72"
        rx="36"
        ry="7"
        fill="#000"
        opacity=".12"
    />

    {/* Body */}
    <path
        d="
            M25 26
            C25 17 42 10 60 10
            C78 10 95 17 95 26
            V48
            C95 58 78 64 60 64
            C42 64 25 58 25 48
            Z"
        fill="url(#side)"
    />

    {/* Front Metallic Strip */}
    <path
        d="
            M47 14
            C55 12 65 12 73 14
            V60
            C65 62 55 62 47 60
            Z"
        fill="url(#front)"
        opacity=".95"
    />

    {/* Top */}
    <ellipse
        cx="60"
        cy="26"
        rx="35"
        ry="16"
        fill="url(#top)"
        stroke="#6BAFC3"
        strokeWidth="1"
    />

    {/* Cisco Router Arrows */}

    <g
        stroke="#FFFFFF"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >

        <path d="M57 24 L42 18"/>
        <path d="M42 18 L46 15"/>
        <path d="M42 18 L44 23"/>

        <path d="M63 24 L78 18"/>
        <path d="M78 18 L74 15"/>
        <path d="M78 18 L76 23"/>

        <path d="M57 29 L42 35"/>
        <path d="M42 35 L46 38"/>
        <path d="M42 35 L44 30"/>

        <path d="M63 29 L78 35"/>
        <path d="M78 35 L74 38"/>
        <path d="M78 35 L76 30"/>

    </g>

</svg>
);
// 2. Cisco 3D Switch (Cyan Isometric Box with 4 White Arrows)
export const SwitchCiscoIcon = ({ width = 72, height = 54 }) => (
  <svg width={width} height={height} viewBox="0 0 100 75" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Base Drop Shadow */}
    <path d="M15 38 L50 54 L85 38 L50 22 Z" fill="#000000" fillOpacity="0.18" filter="blur(3px)" transform="translate(0, 14)" />

    {/* Left Face */}
    <path d="M12 30 L50 46 V 60 L12 44 Z" fill="#0891B2" stroke="#0E7490" strokeWidth="1" />

    {/* Right Front Face */}
    <path d="M50 46 L88 30 V 44 L50 60 Z" fill="#0E7490" stroke="#155E75" strokeWidth="1" />

    {/* Top Face */}
    <path d="M50 14 L88 30 L50 46 L12 30 Z" fill="url(#cisco_switch_top)" stroke="#67E8F9" strokeWidth="1" />

    {/* Top 4 Arrows (2 Parallel Sets of White Arrows) */}
    <g transform="translate(50, 30) scale(0.9)">
      {/* Top Left-to-Right Arrow */}
      <path d="M-16 -5 L14 -5 M8 -9 L16 -5 L8 -1" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Top Right-to-Left Arrow */}
      <path d="M16 -1 L-14 -1 M-8 -5 L-16 -1 L-8 3" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bottom Left-to-Right Arrow */}
      <path d="M-16 5 L14 5 M8 1 L16 5 L8 9" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bottom Right-to-Left Arrow */}
      <path d="M16 9 L-14 9 M-8 5 L-16 9 L-8 13" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>

    <defs>
      <linearGradient id="cisco_switch_top" x1="12" y1="14" x2="88" y2="46" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#67E8F9" />
        <stop offset="50%" stopColor="#22D3EE" />
        <stop offset="100%" stopColor="#0891B2" />
      </linearGradient>
    </defs>
  </svg>
);

// 3. Cisco 3D PC (Light Blue CRT Monitor + Desktop Base + Mouse)
export const PCCiscoIcon = ({ width = 72, height = 54 }) => (
  <svg width={width} height={height} viewBox="0 0 100 75" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Shadow */}
    <ellipse cx="50" cy="65" rx="38" ry="8" fill="#000000" fillOpacity="0.15" filter="blur(2px)" />

    {/* Monitor Back Case 3D Depth */}
    <path d="M28 10 L68 10 L74 34 L22 34 Z" fill="#0891B2" stroke="#0E7490" strokeWidth="1" />

    {/* Monitor Bezel Front Face */}
    <rect x="22" y="12" width="52" height="30" rx="3" fill="#22D3EE" stroke="#67E8F9" strokeWidth="1.5" />

    {/* CRT Screen Display */}
    <rect x="27" y="15" width="42" height="23" rx="2" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="1" />

    {/* Monitor Stand Base */}
    <path d="M38 42 H 58 L62 48 H 34 Z" fill="#0891B2" />

    {/* Keyboard / Desktop Base Unit */}
    <path d="M14 49 L82 49 L88 59 L8 59 Z" fill="#22D3EE" stroke="#0891B2" strokeWidth="1.5" />
    <path d="M18 51 L78 51 L84 57 L12 57 Z" fill="#67E8F9" opacity="0.6" />

    {/* Mouse */}
    <ellipse cx="88" cy="56" rx="3.5" ry="5" fill="#0891B2" stroke="#0E7490" strokeWidth="1" />
  </svg>
);

// 4. Cisco 3D Server (Cyan/Dark Blue Server Unit)
export const ServerCiscoIcon = ({ width = 72, height = 54 }) => (
  <svg width={width} height={height} viewBox="0 0 100 75" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="65" rx="36" ry="8" fill="#000000" fillOpacity="0.15" filter="blur(2px)" />

    {/* Server Tower */}
    <rect x="26" y="10" width="48" height="52" rx="4" fill="#0E7490" stroke="#22D3EE" strokeWidth="1.5" />

    {/* Slots */}
    <rect x="30" y="15" width="40" height="12" rx="2" fill="#155E75" />
    <circle cx="35" cy="21" r="2" fill="#10B981" />
    <circle cx="41" cy="21" r="2" fill="#67E8F9" />

    <rect x="30" y="30" width="40" height="12" rx="2" fill="#155E75" />
    <circle cx="35" cy="36" r="2" fill="#10B981" />
    <circle cx="41" cy="36" r="2" fill="#10B981" />

    <rect x="30" y="45" width="40" height="12" rx="2" fill="#155E75" />
    <circle cx="35" cy="51" r="2" fill="#F59E0B" />
  </svg>
);
