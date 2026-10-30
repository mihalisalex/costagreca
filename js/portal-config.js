/* Connection to the Costa Greca Supabase project.
   The publishable key is meant to be public: the database only lets it
   call the guest_* functions, which check the booking code. */
window.CG_PORTAL = {
  supabaseUrl: "",       // filled in once the Supabase project exists
  supabaseKey: ""        // publishable key (sb_publishable_...)
};
