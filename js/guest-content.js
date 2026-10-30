/* ==========================================================
   Guest area content. Edit freely: this is the text guests see.
   Private details (door codes, Wi-Fi, address) are NOT here; they
   live in the database and are edited from the owner dashboard.
   ========================================================== */

window.CG_CONTENT = {
  // TODO: review these with the villa's actual equipment and rules.
  manual: [
    {
      title: "The pool",
      items: [
        "Please shower before swimming and keep glass away from the pool area.",
        "Children must be supervised by an adult at all times.",
        "Pool towels are separate from bathroom towels; just ask if you need more."
      ]
    },
    {
      title: "Air conditioning",
      items: [
        "Close windows and doors in rooms where the air conditioning is on.",
        "Please switch it off when you leave for the day."
      ]
    },
    {
      title: "Around the house",
      items: [
        "Please respect the neighbours, especially late in the evening.",
        "Let your host know straight away if anything is broken or not working."
      ]
    },
    {
      title: "Departure",
      items: [
        "Leave the keys where you found them and close all windows and doors.",
        "No need to strip beds or clean: housekeeping takes care of it."
      ]
    }
  ],

  guide: [
    {
      name: "Karteros Beach",
      tag: "Beach",
      text: "The long sandy beach at the villa's doorstep, with shallow water and beach bars.",
      maps: "Karteros Beach, Crete"
    },
    {
      name: "Palace of Knossos",
      tag: "History",
      text: "The great Minoan palace of legend. Go early in the morning to beat the heat and the crowds.",
      maps: "Palace of Knossos"
    },
    {
      name: "Heraklion Archaeological Museum",
      tag: "History",
      text: "One of the finest museums in Greece, home to the treasures found at Knossos.",
      maps: "Heraklion Archaeological Museum"
    },
    {
      name: "Koules Fortress & the old harbour",
      tag: "Heraklion",
      text: "The Venetian sea fortress guarding Heraklion's harbour. Walk the breakwater at sunset.",
      maps: "Koules Fortress Heraklion"
    },
    {
      name: "Lions Square & 25th August Street",
      tag: "Heraklion",
      text: "The heart of the old town: the Morosini fountain, cafés and a pedestrian street down to the sea.",
      maps: "Lions Square Heraklion"
    },
    {
      name: "Cretaquarium",
      tag: "Family",
      text: "One of the largest aquariums in the Mediterranean, a short drive east along the coast.",
      maps: "Cretaquarium"
    }
  ],

  // Arranged by the owner on request; price and availability are confirmed personally.
  experiences: [
    { id: "chef", title: "Private chef dinner", text: "A Cretan feast prepared in the villa's kitchen and served on the terrace." },
    { id: "massage", title: "In-villa massage", text: "A therapist comes to the villa for massages by the pool or in your room." },
    { id: "boat", title: "Boat day", text: "A day on the water with swimming stops along the coast." },
    { id: "wine", title: "Winery visit", text: "Tasting at a vineyard in the Heraklion wine country." },
    { id: "transfer", title: "Airport transfer", text: "A private driver waiting for you at Heraklion Airport." },
    { id: "car", title: "Car rental", text: "A car delivered to the villa for the length of your stay." }
  ],

  provisions: [
    "Cretan extra virgin olive oil",
    "Thyme honey",
    "Graviera cheese",
    "Fresh seasonal fruit",
    "Greek yogurt",
    "Fresh bread",
    "Barley rusks (paximadia)",
    "Eggs",
    "Coffee & milk",
    "Mineral water",
    "Cretan white wine",
    "Cretan red wine",
    "Raki (tsikoudia)"
  ],

  housekeeping: [
    "Extra towels",
    "Fresh bed linen",
    "Mid-stay cleaning",
    "Late check-out"
  ]
};
