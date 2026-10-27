# Flight Procedures

Data-driven flight procedure definitions for automated flight control via the MCP server.

## takeoff_sequence.json

B737 MAX 8 complete takeoff sequence from ground to initial climb with AP/LNAV/VNAV.

### Prerequisites
- FMC fully programmed (route, departure, arrival, perf init, takeoff ref)
- Engines running, flaps set, parking brake on

### Steps
1. Verify engines running (N2 > 63%)
2. Verify flaps set to takeoff position
3. Release parking brake
4. Throttle 40% — stabilize 3 seconds
5. TOGA thrust (full throttle)
6. Monitor airspeed → V1 callout
7. Rotate at VR (elevator pull back)
8. Positive rate → Gear up
9. Flap retraction at THR_RED + 1000 ft AGL (5→2→1→UP stepwise)
10. Neutralize elevator
11. Engage AP (requires neutral elevator)
12. Engage LNAV
13. Engage VNAV

### Key Learnings
- `AP_MASTER` won't engage with deflected elevator — neutralize first
- Flap retraction is stepwise with speed gates between each step
- `AXIS_ELEVATOR_SET` uses 0-16384 unsigned range (4000 ≈ 8° pitch up)
- Standard K-events (PARKING_BRAKES, THROTTLE_SET, etc.) work via TCP SimConnect
- CDU key presses use B-variable input events via FFI bridge SetInputEvent (4-param SDK signature)
