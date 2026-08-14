# BeagleBone Black DDR3L connection map

This is the endpoint map used by every sample. It was transcribed from the official BeagleBone Black D1 schematic: U12 on sheet 7 and U5 on sheet 3.

| Board net | U12 ball | U12 pin | U5 ball | AM3358 pin |
|---|---:|---|---:|---|
| DDR_D0 | E3 | DQ0 | M3 | DDR_D0 |
| DDR_D1 | F7 | DQ1 | M4 | DDR_D1 |
| DDR_D2 | F2 | DQ2 | N1 | DDR_D2 |
| DDR_D3 | F8 | DQ3 | N2 | DDR_D3 |
| DDR_D4 | H3 | DQ4 | N3 | DDR_D4 |
| DDR_D5 | H8 | DQ5 | N4 | DDR_D5 |
| DDR_D6 | G2 | DQ6 | P3 | DDR_D6 |
| DDR_D7 | H7 | DQ7 | P4 | DDR_D7 |
| DDR_D8 | D7 | DQ8 | J1 | DDR_D8 |
| DDR_D9 | C3 | DQ9 | K1 | DDR_D9 |
| DDR_D10 | C8 | DQ10 | K2 | DDR_D10 |
| DDR_D11 | C2 | DQ11 | K3 | DDR_D11 |
| DDR_D12 | A7 | DQ12 | K4 | DDR_D12 |
| DDR_D13 | A2 | DQ13 | L3 | DDR_D13 |
| DDR_D14 | B8 | DQ14 | L4 | DDR_D14 |
| DDR_D15 | A3 | DQ15 | M1 | DDR_D15 |
| DDR_DQS0 | F3 | LDQS | P1 | DDR_DQS0 |
| DDR_DQSN0 | G3 | LDQSn | P2 | DDR_DQSN0 |
| DDR_DQM0 | E7 | LDM | M2 | DDR_DQM0 |
| DDR_DQS1 | C7 | UDQS | L1 | DDR_DQS1 |
| DDR_DQSN1 | B7 | UDQSn | L2 | DDR_DQSN1 |
| DDR_DQM1 | D3 | UDM | J2 | DDR_DQM1 |
| DDR_A0 | N3 | A0 | F3 | DDR_A0 |
| DDR_A1 | P7 | A1 | H1 | DDR_A1 |
| DDR_A2 | P3 | A2 | E4 | DDR_A2 |
| DDR_A3 | N2 | A3 | C3 | DDR_A3 |
| DDR_A4 | P8 | A4 | C2 | DDR_A4 |
| DDR_A5 | P2 | A5 | B1 | DDR_A5 |
| DDR_A6 | R8 | A6 | D5 | DDR_A6 |
| DDR_A7 | R2 | A7 | E2 | DDR_A7 |
| DDR_A8 | T8 | A8 | D4 | DDR_A8 |
| DDR_A9 | R3 | A9 | C1 | DDR_A9 |
| DDR_A10 | L7 | A10 | F4 | DDR_A10 |
| DDR_A11 | R7 | A11 | F2 | DDR_A11 |
| DDR_A12 | N7 | A12 | E3 | DDR_A12 |
| DDR_A13 | T3 | A13 | H3 | DDR_A13 |
| DDR_A14 | T7 | A14 | H4 | DDR_A14 |
| DDR_A15 | M7 | A15 | D3 | DDR_A15 |
| DDR_BA0 | M2 | BA0 | C4 | DDR_BA0 |
| DDR_BA1 | N8 | BA1 | E1 | DDR_BA1 |
| DDR_BA2 | M3 | BA2 | B3 | DDR_BA2 |
| DDR_RASn | J3 | RASn | G4 | DDR_RASn |
| DDR_CASn | K3 | CASn | F1 | DDR_CASn |
| DDR_WEn | L3 | WEn | B2 | DDR_WEn |
| DDR_CLK | J7 | CK | D2 | DDR_CK |
| DDR_CLKn | K7 | CKn | D1 | DDR_NCK |
| DDR_CKE | K9 | CKE | G3 | DDR_CKE |
| DDR_CSn | L2 | CSn | H2 | DDR_CSN0 |
| DDR_ODT | K1 | ODT | G1 | DDR_ODT |
| DDR_RESETn | T2 | RESET# | J3 | DDR_RESET |

The machine-readable source of truth is [`reference/beaglebone-black-ddr3-map.json`](reference/beaglebone-black-ddr3-map.json). Power, ground, VREF, ZQ, decoupling, and external termination components are excluded because they are not direct U12-to-U5 nets.
