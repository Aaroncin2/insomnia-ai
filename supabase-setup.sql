-- =============================================
-- Insomnia AI - Supabase Database Setup
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- SESSIONS TABLE
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ended_at TIMESTAMPTZ,
  total_alerts INTEGER DEFAULT 0,
  total_drowsy INTEGER DEFAULT 0,
  total_distracted INTEGER DEFAULT 0,
  total_yawns INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0
);

-- EVENTS TABLE
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  data JSONB DEFAULT '{}'::jsonb
);

-- =============================================
-- PROFILES TABLE (roles)
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role VARCHAR(20) DEFAULT 'worker' NOT NULL CHECK (role IN ('worker', 'supervisor', 'admin')),
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================
-- GROUPS TABLE (teams)
-- =============================================
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(8) UNIQUE NOT NULL,
  supervisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================
-- GROUP MEMBERS TABLE (workers in groups)
-- =============================================
CREATE TABLE IF NOT EXISTS group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(group_id, user_id)
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_groups_supervisor_id ON groups(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_groups_code ON groups(code);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PROFILES POLICIES
-- =============================================

-- Everyone can read all profiles (needed for admin panel and supervisor to see names)
CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Only admins can update any profile (for role changes)
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can update their own profile (name only, not role)
CREATE POLICY "Users can update own profile name"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- =============================================
-- SESSIONS POLICIES
-- =============================================

-- Users can view own sessions
CREATE POLICY "Users can view own sessions"
  ON sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Supervisors can view sessions of workers in their groups
CREATE POLICY "Supervisors can view group worker sessions"
  ON sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE g.supervisor_id = auth.uid()
        AND gm.user_id = sessions.user_id
    )
  );

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions"
  ON sessions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can insert own sessions
CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own sessions
CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================
-- EVENTS POLICIES
-- =============================================

-- Users can view own events
CREATE POLICY "Users can view own events"
  ON events FOR SELECT
  USING (auth.uid() = user_id);

-- Supervisors can view events of workers in their groups
CREATE POLICY "Supervisors can view group worker events"
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE g.supervisor_id = auth.uid()
        AND gm.user_id = events.user_id
    )
  );

-- Admins can view all events
CREATE POLICY "Admins can view all events"
  ON events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can insert own events
CREATE POLICY "Users can insert own events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- GROUPS POLICIES
-- =============================================

-- Supervisors can view their own groups
CREATE POLICY "Supervisors can view own groups"
  ON groups FOR SELECT
  USING (supervisor_id = auth.uid());

-- Admins can view all groups
CREATE POLICY "Admins can view all groups"
  ON groups FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Workers can view groups they belong to
CREATE POLICY "Workers can view their groups"
  ON groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
        AND group_members.user_id = auth.uid()
    )
  );

-- Anyone can select groups by code (for joining)
CREATE POLICY "Anyone can lookup group by code"
  ON groups FOR SELECT
  USING (true);

-- Admins can insert groups
CREATE POLICY "Admins can insert groups"
  ON groups FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update groups
CREATE POLICY "Admins can update groups"
  ON groups FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can delete groups
CREATE POLICY "Admins can delete groups"
  ON groups FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- GROUP_MEMBERS POLICIES
-- =============================================

-- Supervisors can view members of their groups
CREATE POLICY "Supervisors can view group members"
  ON group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
        AND groups.supervisor_id = auth.uid()
    )
  );

-- Admins can view all group members
CREATE POLICY "Admins can view all group members"
  ON group_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Workers can view their own memberships
CREATE POLICY "Workers can view own memberships"
  ON group_members FOR SELECT
  USING (user_id = auth.uid());

-- Workers can insert themselves (join group)
CREATE POLICY "Workers can join groups"
  ON group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can insert members
CREATE POLICY "Admins can add group members"
  ON group_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can remove members
CREATE POLICY "Admins can remove group members"
  ON group_members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Workers can remove themselves from groups
CREATE POLICY "Workers can leave groups"
  ON group_members FOR DELETE
  USING (user_id = auth.uid());

-- =============================================
-- FUNCTION: Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    'worker',
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: create profile on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
