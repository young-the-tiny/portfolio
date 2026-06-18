# Interactive WebGL Fluid Portfolio

A highly interactive, high-performance static portfolio website for **Ta Tran Tuyen (ML Engineer & Researcher)**. Built using pure WebGL shaders to simulate realistic, organic fluid physics directly in the browser.

---

## Key Features

* **Interactive Water Physics:**
  * **Bow-Wave Parting:** Particles part radially away from the cursor based on mouse velocity.
  * **Wake Turbulence:** Leaves a trailing swirl of ripples strictly behind the moving cursor using vector dot products.
* **3D Dropped Stone Ripples:**
  * Simulates circular ripples spreading from the cursor, displacing the grid vertically (Y-axis) and radially to create a tactile 3D wave.
* **Partial Morphing:**
  * Hovering over project cards morphs **60%** of the particles into custom geometric outlines (triangle, target rings, or hexagon) while **40%** remain in the background as a floating, breathing starry field for depth.
* **Organic Color Transitions:**
  * Dynamic, real-time Google brand color cycling (`#4285F4`, `#EA4335`, `#FBBC05`, `#34A853`) customized per particle.
* **Premium Dark Mode:**
  * Seamless theme toggler (Sun/Moon icons) with browser preference fallback and `localStorage` persistence.
  * **Zero-Flash Script:** Pre-paint head script prevents theme flashes on load.

---

## Technology Stack

* **Structure:** Semantic HTML5
* **Styling:** Vanilla CSS (Custom Properties, Flexbox, Transitions)
* **Graphics Engine:** WebGL 1.0 (GLSL ES 1.0 Vertex & Fragment shaders)
* **Animation Loop:** `requestAnimationFrame` with smoothed mouse coordinates and velocity decay.

---

## Mathematics in the Shaders

* **Bounded Swirling (Orbit):**
  $$\text{Angle} = \sin(t \cdot 0.3) \cdot 0.8 \cdot e^{-3d} \cdot \text{morphDrift}$$
  Uses a bounded sine function to ensure particles swirl back and forth organically and never glitch or accelerate over time.
* **Wake Angle Masking:**
  $$\text{Mask} = \text{smoothstep}(0.0, -0.7, \dots)$$
  Limits the wake disturbance to a cone directly behind the cursor's velocity vector.
* **Ripple Wave Displacement:**
  $$\text{Wave} = \sin(d \cdot 16.0 - t \cdot 0.8) \cdot e^{-3.5d}$$
  Creates a decaying concentric wave propagating outward from the cursor.
