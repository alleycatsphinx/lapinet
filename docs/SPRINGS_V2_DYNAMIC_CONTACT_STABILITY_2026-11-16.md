# Springs V2 — Dynamic-contact force stability
Date: 2026-11-16
Author: Noether
Demo: http://127.0.0.1:1351/springs-v2.html
Scope: V2 only; original Springs and E8 demos unchanged.

## Diagnosis
The original pair coefficient rounds to an integer before multiplying
the full displacement. This creates a dead zone at low stiffness, followed
by an abrupt whole-displacement-sized kick. With 216 particles and the
older 210% interaction radius, 2,712 pairs are active. At strengths 1
and 4, the largest initial momentum kicks were 10,368 and 103,680.

With the recommended new 155% interaction radius and 100% rest scale,
the legacy law gives *zero* initial force at strengths 1–3, then jumps
to a peak of 6,144 at strength 4.

## Revised reversible force (dynamic mode only)
Positions and momenta remain signed integers. For each pair within the
contact cutoff R, let d be the signed integer position displacement,
q the coordinate precision, r² = dot(trunc(d/q),trunc(d/q)), and
rest² the integer scaled squared rest length.

    radial = clamp(r²-rest², -rest², rest²)
    fade = min(256, trunc(256*(R²-r²)/(R²-rest²)))
    raw = trunc(radial*strength*fade/(4*rest²))
    k = clamp(trunc(raw*16/(16+strength)), -2048, 2048)
    impulse = trunc(d*k/16384)  (per component)

The fade is 256 throughout the active radius when the cutoff is at
or below the rest length. All CPU and WGSL arithmetic is integer.
Each pair gets exact equal-and-opposite impulses, preserving total linear
momentum. The kick depends on positions and recorded coefficients only;
undoing drift and subtracting the same kick exactly reverses the step.
Componentwise impulse rounding can introduce small torque quantization.
Exact reversal does not imply exact energy conservation or indefinitely
bounded motion.

The Q14 factor resolves low strengths, while tapering removes the sudden
force at the interaction boundary. The rational high-end compression
prevents strength 64 from multiplying effects 64-fold. A legacy selector
allows explicit comparisons, resetting the solver upon change.

## Recommended demo preset
Choose Dynamic nearby contacts, Smooth, strength 12, initial deformation 10,
rest length 100%, contact radius 155%; start with strengths 1–4 and tune
from there. Strength and radius remain live, branchable coefficients.

## Measured V2 response on the same 216-particle fixture
Strength | Peak initial momentum kick | Maximum extent at tick 300
0          0                            250
1          11                           236
2          25                           219
3          35                           206
4          45                           183
8          79                           130
12         102                          196
32         160                          433
64         191                          571

At strength 4 the legacy peak is 6,144 for the same fixture.
This is an initial-condition measurement, not a general stability proof;
high-strength nonlinear contacts can still become irregular.

## Verification
Five new CPU tests cover low-strength response, exact pair momentum,
cutoff taper, legacy bit parity, 224-tick exact inverse with changing
coefficients, and 300-tick trajectory limits. Native Apple WebGPU
certificates passed for 216 particles at strengths 1, 4, 12, 32, 64;
216 legacy; 512 smooth; and five changes of live strength/radius with
exact reversal through all history boundaries. Zero CPU/GPU and inverse
mismatches in each certificate.

This change is isolated to V2 dynamic mode. The existing bonded, flock,
and ballistic solvers and original Springs/E8 pages are unchanged.
