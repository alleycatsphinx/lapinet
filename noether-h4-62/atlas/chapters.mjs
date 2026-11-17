export const chapters=[
  {
    "key": "origin",
    "num": "00",
    "title": "Begin with a point",
    "kicker": "An address is not yet motion.",
    "description": "One location, one identity, one reversible question.",
    "lesson": "A state is information that can be reconstructed.",
    "equation": "S = (position, motion, identity)",
    "href": "index.html"
  },
  {
    "key": "line",
    "num": "01",
    "title": "One dimension",
    "kicker": "A point can move along a line.",
    "description": "See signed integer displacement, direction and its inverse.",
    "lesson": "An exact step can be undone by subtracting it.",
    "equation": "x′ = x + v ; x = x′ − v",
    "href": "01-line.html"
  },
  {
    "key": "dimensions",
    "num": "02",
    "title": "Up through dimensions",
    "kicker": "Each new coordinate opens a new direction.",
    "description": "Unfold a line, square, cube, tesseract, and eight-dimensional hypercube.",
    "lesson": "A projection shows a shadow, not all of the higher-dimensional information.",
    "equation": "x = (x₁, x₂, …, x₈)",
    "href": "02-dimensions.html"
  },
  {
    "key": "e8",
    "num": "03",
    "title": "The E8 root lattice",
    "kicker": "240 exact root directions in eight dimensions.",
    "description": "Distinguish the integer lattice from a hypercube or a 3D picture.",
    "lesson": "Every root is an exact allowed direction; the drawing is only a projection.",
    "equation": "r ∈ E8 roots,  ⟨r,r⟩ = 2",
    "href": "03-e8.html"
  },
  {
    "key": "shadow",
    "num": "04",
    "title": "The golden shadow",
    "kicker": "How H4 geometry appears from an E8 construction.",
    "description": "Project exact eight-integer coordinates through a golden four-space, then into three display axes.",
    "lesson": "H4 and its golden structure illuminate E8; the 3D picture is not the simulation state.",
    "equation": "qⱼ = (aⱼ + φ bⱼ) / 2",
    "href": "04-shadow.html"
  },
  {
    "key": "state",
    "num": "05",
    "title": "What a particle knows",
    "kicker": "Position, root channel, and stable identity.",
    "description": "An eight-integer site and one of 240 channels determine a discrete particle record.",
    "lesson": "A visible arrow is only a projection of an exact channel.",
    "equation": "Sᵢ = (idᵢ, kᵢ ∈ ℤ₄₀₉₆⁸, cᵢ ∈ {0…239})",
    "href": "05-state.html"
  },
  {
    "key": "transport",
    "num": "06",
    "title": "Transport",
    "kicker": "Move by an allowed root step—or remain still.",
    "description": "Use the real E8 transport map and its invariant scheduling gate.",
    "lesson": "Because the gate survives the hop, the same decision can be reversed.",
    "equation": "k′ = k + r(c) (mod 4096), when gated",
    "href": "06-transport.html"
  },
  {
    "key": "time",
    "num": "07",
    "title": "Scheduled time",
    "kicker": "Time is an index of ordered reversible maps.",
    "description": "See how changing the event index changes which hops are permitted.",
    "lesson": "Rewind traverses known event indices in reverse order; it is not a negative floating timestep.",
    "equation": "Uₙ, Uₙ₊₁, … ; inverse order …, Uₙ₊₁⁻¹, Uₙ⁻¹",
    "href": "07-time.html"
  },
  {
    "key": "collisions",
    "num": "08",
    "title": "Exact local collisions",
    "kicker": "Same site, stable partners, changed directions.",
    "description": "Watch a genuine E8 root reflection preserve pair momentum, then undo itself.",
    "lesson": "Collision first, then transport; inverse transport first, then collision.",
    "equation": "Rₐ(v) = v − ⟨v,a⟩a ; Rₐ² = I",
    "href": "08-collisions.html"
  },
  {
    "key": "springs",
    "num": "09",
    "title": "Springs",
    "kicker": "Kick the momentum; drift the positions.",
    "description": "Two linked particles exchange equal and opposite integer momentum kicks.",
    "lesson": "Undo drift before subtracting the same position-derived kick.",
    "equation": "K: p′ = p + F(x) ; D: x′ = x + ⌊p′/256⌋₀",
    "href": "09-springs.html"
  },
  {
    "key": "flock",
    "num": "10",
    "title": "Flocking without forgetting",
    "kicker": "An auxiliary state carries what averaging would erase.",
    "description": "Three particles exchange reversible visible and hidden momentum and local cohesion kicks.",
    "lesson": "Do the inverse shears in the opposite order; no information is discarded.",
    "equation": "Sᵢ = (xᵢ, pᵢ, hᵢ)",
    "href": "10-flock.html"
  },
  {
    "key": "inverse",
    "num": "11",
    "title": "The complete return",
    "kicker": "Reversal is an operation, not a video played backward.",
    "description": "Compose real E8 collision and scheduled transport, then compute the inverse.",
    "lesson": "A correct inverse restores every integer word, not merely the drawing.",
    "equation": "Uₙ = Tₙ ∘ Cₙ ; Uₙ⁻¹ = Cₙ ∘ Tₙ⁻¹",
    "href": "11-inverse.html"
  }
];
