-- Organizer-sent application invitations.
-- A row created by an organizer invite starts life as status 'invited' (email
-- sent, student has not opened the form). invited_at is the discriminator that
-- keeps these rows visible to the organizer through their whole lifecycle,
-- while self-serve drafts stay hidden. Non-null ⇒ organizer-invited.
alter table applications add column invited_at timestamptz;
