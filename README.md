# Costa Greca

Website for Costa Greca, a private luxury villa near Karteros Beach, Crete.

A static site (`index.html`, `css/`, `js/`) plus one serverless function (`api/availability.js`), built to be hosted on Vercel.

## Editing

- **Text and photos:** `index.html` (see `images/README.md` for replacing the placeholder photos)
- **Contact details, Airbnb/Booking.com links, minimum stay:** the `CONFIG` block at the top of `js/main.js`
- **Colours and fonts:** the variables at the top of `css/style.css`

## Calendar sync with Airbnb and Booking.com

The booking calendar shows nights that are already booked on Airbnb and Booking.com.
In Vercel, add these environment variables (Project → Settings → Environment Variables):

| Variable | Where to find it |
| --- | --- |
| `AIRBNB_ICAL_URL` | Airbnb → Listing → Availability → Connect calendars → Export calendar |
| `BOOKING_ICAL_URL` | Booking.com extranet → Rates & Availability → Sync calendars → Export calendar |

Without them, every future date shows as available.

## Running locally

```
python3 -m http.server 4321
```

Then open http://localhost:4321. The calendar sync only works when the site is deployed (or with `vercel dev`).

## Guest area and villa office

- `guest.html`: the guest area; guests sign in with the code from their booking
- `owner.html`: the villa office, for creating bookings and codes, answering requests and editing villa details
- `api/guest.js`, `api/owner.js`: server functions that talk to the Neon database
- `js/guest-content.js`: the manual, Crete guide, experiences and fridge list guests see

Vercel environment variables needed:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Neon connection string (added automatically when Neon is connected to the Vercel project) |
| `OWNER_PASSWORD` | The password for the villa office. Changing it signs every device out |

The database tables are created automatically on the first request.
