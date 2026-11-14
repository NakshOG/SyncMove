# Adaptive Breakpoint Results

The runner increases pressure in stages and stops a target when p95 exceeds 2000 ms or error rate exceeds 10%. It then waits for recovery before moving to the next target.

| Target | Concurrency | Requests | Successes | Failures | p95 | Error rate | Stopped | Reason |
|---|---:|---:|---:|---:|---:|---:|---|---|
| api | 50 | 4293 | 4293 | 0 | 40.28 ms | 0% | no | - |
| api | 100 | 4786 | 4786 | 0 | 67.42 ms | 0% | no | - |
| api | 150 | 5504 | 5504 | 0 | 78.93 ms | 0% | no | - |
| api | 200 | 5405 | 5405 | 0 | 78.37 ms | 0% | no | - |
| api | 250 | 4140 | 4140 | 0 | 215.38 ms | 0% | no | - |
| api | 300 | 5156 | 5156 | 0 | 175.17 ms | 0% | no | - |
| api | 350 | 5466 | 5466 | 0 | 192.86 ms | 0% | no | - |
| api | 400 | 5343 | 5343 | 0 | 228.8 ms | 0% | no | - |
| api | 450 | 4918 | 4918 | 0 | 1808.08 ms | 0% | no | - |
| api | 500 | 4903 | 4903 | 0 | 2437.47 ms | 0% | yes | p95>2000ms or errors>10% |
| sfu-signaling | 50 | 50 | 50 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 100 | 100 | 100 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 150 | 150 | 150 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 200 | 200 | 200 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 250 | 250 | 250 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 300 | 300 | 300 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 350 | 350 | 350 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 400 | 400 | 400 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 450 | 450 | 450 | 0 | n/a ms | 0% | no | - |
| sfu-signaling | 500 | 500 | 500 | 0 | n/a ms | 0% | no | - |

Raw data: ADAPTIVE-BREAKPOINT-RESULTS.json. This test does not claim video capacity without actual WebRTC media producers.
