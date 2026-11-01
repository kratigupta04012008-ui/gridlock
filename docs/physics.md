# GRID LOCK — Physics, Kinematics & Simulation Engine Specification

## 1. Coordinate Systems & Units

### 1.1 SI Units
The simulation engine operates exclusively in SI units:
- **Distance / Position**: meters ($\text{m}$)
- **Time**: seconds ($\text{s}$)
- **Velocity**: meters per second ($\text{m/s}$)
- **Acceleration**: meters per second squared ($\text{m/s}^2$)
- **Jerk**: meters per second cubed ($\text{m/s}^3$)
- **Heading / Angles**: radians ($\text{rad}$)

### 1.2 Rendering Scale
The visualization layer converts simulation meters to canvas pixels using a single global constant:
$$\text{PIXELS\_PER\_METER} = 10.0\text{ px/m}$$

- World boundary: $80.0\text{ m} \times 80.0\text{ m}$ ($800\text{ px} \times 800\text{ px}$)
- Lane width: $3.8\text{ m}$ ($38\text{ px}$)
- Road width (4 lanes): $15.2\text{ m}$ ($152\text{ px}$)
- Center intersection box: $15.2\text{ m} \times 15.2\text{ m}$ ($[32.4, 32.4]\text{ m}$ to $[47.6, 47.6]\text{ m}$)
- Standard vehicle length: $4.5\text{ m}$ ($45\text{ px}$)
- Standard vehicle width: $1.9\text{ m}$ ($19\text{ px}$)

### 1.3 Traffic Handedness: Right-Hand Traffic (RHT)
The simulation strictly follows standard **Right-Hand Traffic (RHT)**:
- Vehicles travel on the right-hand side of the road median.
- **Northbound vehicles** travel on the East side of the North-South road (moving $-y$).
- **Southbound vehicles** travel on the West side of the North-South road (moving $+y$).
- **Eastbound vehicles** travel on the South side of the East-West road (moving $+x$).
- **Westbound vehicles** travel on the North side of the East-West road (moving $-x$).
- **Right turns** make a short, tight turn into the adjacent outbound lane without crossing opposing flows.
- **Left turns** make a wide sweeping arc, crossing opposing inbound traffic lanes.

---

## 2. Timestep & Anti-Tunneling Proof

### 2.1 Fixed Timestep
$$\Delta t = 0.02\text{ s}\quad (50\text{ Hz})$$

The simulation clock is an integer step counter:
$$\text{simTime} = \text{step} \times \Delta t$$
Floating-point time is never accumulated, eliminating numerical drift.

### 2.2 Anti-Tunneling Verification
To prevent collision "tunneling" (where fast-moving vehicles pass through each other between steps without overlapping), the maximum displacement per step must remain well below half the smallest vehicle dimension:
- Smallest vehicle dimension: $\text{width} = 1.9\text{ m} \implies \frac{1}{2}\text{width} = 0.95\text{ m}$.
- Maximum vehicle velocity: $v_{max} = 14.0\text{ m/s}$.
- Maximum single-step displacement:
  $$\Delta s_{max} = v_{max} \cdot \Delta t = 14.0 \cdot 0.02 = 0.28\text{ m}$$
- Safety ratio:
  $$\frac{\Delta s_{max}}{\frac{1}{2}\text{width}} = \frac{0.28\text{ m}}{0.95\text{ m}} \approx 0.295 < 0.30$$
Because the maximum displacement per step is less than $30\%$ of the half-width, two vehicles cannot pass through each other undetected.

### 2.3 Integer Decision Intervals
Any decision interval (e.g. $0.1\text{ s}$, $0.2\text{ s}$, $0.5\text{ s}$, $1.0\text{ s}$) is an exact integer multiple of $\Delta t$:
- $0.1\text{ s} = 5\text{ steps}$
- $0.2\text{ s} = 10\text{ steps}$
- $0.5\text{ s} = 25\text{ steps}$
- $1.0\text{ s} = 50\text{ steps}$

---

## 3. Vehicle Kinematics & Analytical Integration

### 3.1 Physical Limits
- $v_{max} \in [12.0, 14.0]\text{ m/s}$ (default: $13.5\text{ m/s}$)
- $a_{max} = 3.0\text{ m/s}^2$
- $b_{max} = 8.0\text{ m/s}^2$ (maximum deceleration)
- $j_{max} = 8.0\text{ m/s}^3$ (jerk limit)

### 3.2 Jerk Limiting
When a vehicle receives a target acceleration $a_{target}$, its actual acceleration $a$ moves toward $a_{target}$ restricted by the jerk limit:
$$\Delta a_{max} = j_{max} \cdot \Delta t$$
$$a_{new} = \text{clamp}(a_{target},\ a - \Delta a_{max},\ a + \Delta a_{max})$$

### 3.3 Piecewise-Constant Exact Integration
Over each timestep $\Delta t$, acceleration $a$ is constant. Rather than naive Euler integration (which drifts and suffers truncation errors), exact kinematics are evaluated with analytical boundary clipping:

#### Case A: Braking / Deceleration ($a < 0$)
Time required to reach full stop ($v = 0$):
$$t_{stop} = \frac{-v_0}{a} = \frac{v_0}{|a|}$$
- If $t_{stop} < \Delta t$:
  The vehicle stops mid-step at $t = t_{stop}$.
  $$\Delta s = \frac{v_0^2}{2 |a|}$$
  $$v_{end} = 0$$
  $$a_{end} = 0$$
- If $t_{stop} \ge \Delta t$:
  $$\Delta s = v_0 \Delta t + \frac{1}{2} a (\Delta t)^2$$
  $$v_{end} = v_0 + a \Delta t$$

*Vehicles never roll backward ($v \ge 0$).*

#### Case B: Acceleration ($a > 0$)
Time required to reach maximum velocity $v_{max}$:
$$t_{max} = \frac{v_{max} - v_0}{a}$$
- If $t_{max} < \Delta t$:
  The vehicle accelerates until $t = t_{max}$, then cruises at $v_{max}$ for the remainder:
  $$\Delta s = v_0 t_{max} + \frac{1}{2} a t_{max}^2 + v_{max} (\Delta t - t_{max})$$
  $$v_{end} = v_{max}$$
  $$a_{end} = 0$$
- If $t_{max} \ge \Delta t$:
  $$\Delta s = v_0 \Delta t + \frac{1}{2} a (\Delta t)^2$$
  $$v_{end} = v_0 + a \Delta t$$

#### Case C: Coasting ($a = 0$)
$$\Delta s = v_0 \Delta t$$
$$v_{end} = v_0$$

---

## 4. Action Interface & Hold-Last-Action Semantics

The engine accepts vehicle commands via:
`engine.applyActions(actions)`

### 4.1 Action Semantics
1. **`ACCELERATE`** with `throttle` $\in [0, 1]$:
   $$a_{target} = \text{throttle} \cdot a_{max}$$
2. **`BRAKE`** with `intensity` $\in [0, 1]$:
   $$a_{target} = -\text{intensity} \cdot b_{max}$$
3. **`MAINTAIN`**:
   $$a_{target} = 0\text{ m/s}^2$$

### 4.2 Latching / Holding Last Action
Because the decision tick loop (e.g. $2\text{ Hz}$ to $5\text{ Hz}$) runs slower than the physics loop ($50\text{ Hz}$), a vehicle **holds its last commanded action** until a new action arrives for its ID.
- **Consequence**: If a vehicle is commanded to `ACCELERATE` and no new command arrives, it will continue accelerating until reaching $v_{max}$, and will cruise at $v_{max}$ indefinitely. The engine does NOT apply safety braking or intervene if an obstacle is ahead.

---

## 5. Collision Detection: Separating Axis Theorem (SAT)

Collisions are detected as an **objective physical measurement**; there is zero collision response or artificial avoidance physics. Vehicles continue their trajectories regardless of contact.

### 5.1 Oriented Bounding Boxes (OBB)
Each vehicle is modeled as an Oriented Bounding Box defined by its center $(x_c, y_c)$, half-length $L/2$, half-width $W/2$, and heading angle $\theta$.

Its 4 corner vertices in world coordinates are:
$$\begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} x_c \\ y_c \end{pmatrix} + R(\theta) \begin{pmatrix} \pm L/2 \\ \pm W/2 \end{pmatrix}$$
where $R(\theta) = \begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix}$.

### 5.2 Separating Axis Test
For two bounding boxes $A$ and $B$, 4 normal axes are tested (the 2 orthogonal edge directions of $A$, and the 2 orthogonal edge directions of $B$).
For each axis $\vec{u}$:
1. Project all 4 vertices of $A$ onto $\vec{u}$, yielding interval $[A_{min}, A_{max}]$.
2. Project all 4 vertices of $B$ onto $\vec{u}$, yielding interval $[B_{min}, B_{max}]$.
3. If $A_{max} < B_{min} + \epsilon$ or $B_{max} < A_{min} + \epsilon$ (where $\epsilon = 0.01\text{ m}$), a separating axis exists $\implies$ **No collision**.

If no separating axis exists across all 4 axes, the boxes intersect.

### 5.3 Collision Transition Counting
- When a pair $(i, j)$ transitions from **not overlapping** to **overlapping**, `collisions` increments by $1$.
- While the pair remains overlapping in subsequent steps, the counter does not increment again.
- Once the pair separates, they may trigger a new collision if they contact again.

---

## 6. Vehicle Clearing

A vehicle is declared **`cleared`** when its rear bumper passes the exit line of its path:
$$s - \frac{L}{2} \ge s_{exit}$$
- `clearedTotal`: Total vehicles that reached the exit line.
- `clearedClean`: Vehicles that reached the exit line without ever experiencing a collision.
Once cleared, the vehicle is removed from active physics and collision checks.
