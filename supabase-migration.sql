-- =============================================
-- Insomnia AI - MIGRACIÓN: Sistema de Roles y Grupos
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ⚠️ Solo ejecutar si ya tienes las tablas sessions y events
-- =============================================

-- ═══════════════════════════════════════════
-- PASO 1: Crear tabla PROFILES (roles)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role VARCHAR(20) DEFAULT 'worker' NOT NULL CHECK (role IN ('worker', 'supervisor', 'admin')),
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ═══════════════════════════════════════════
-- PASO 2: Crear tabla GROUPS (equipos)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(8) UNIQUE NOT NULL,
  supervisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ═══════════════════════════════════════════
-- PASO 3: Crear tabla GROUP_MEMBERS (workers en grupos)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(group_id, user_id)
);

-- ═══════════════════════════════════════════
-- PASO 4: Índices nuevos
-- ═══════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_groups_supervisor_id ON groups(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_groups_code ON groups(code);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- ═══════════════════════════════════════════
-- PASO 5: RLS en tablas nuevas
-- ═══════════════════════════════════════════
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════
-- PASO 6: Políticas para PROFILES
-- ═══════════════════════════════════════════
CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can update own profile name"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ═══════════════════════════════════════════
-- PASO 7: Políticas NUEVAS para SESSIONS
-- (las que ya tienes siguen funcionando)
-- ═══════════════════════════════════════════
CREATE POLICY "Supervisors can view group worker sessions"
  ON sessions FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE g.supervisor_id = auth.uid()
        AND gm.user_id = sessions.user_id
    )
  );

CREATE POLICY "Admins can view all sessions"
  ON sessions FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ═══════════════════════════════════════════
-- PASO 8: Políticas NUEVAS para EVENTS
-- (las que ya tienes siguen funcionando)
-- ═══════════════════════════════════════════
CREATE POLICY "Supervisors can view group worker events"
  ON events FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE g.supervisor_id = auth.uid()
        AND gm.user_id = events.user_id
    )
  );

CREATE POLICY "Admins can view all events"
  ON events FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ═══════════════════════════════════════════
-- PASO 9: Políticas para GROUPS
-- ═══════════════════════════════════════════
CREATE POLICY "Anyone can lookup group by code"
  ON groups FOR SELECT USING (true);

CREATE POLICY "Admins can insert groups"
  ON groups FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update groups"
  ON groups FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete groups"
  ON groups FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ═══════════════════════════════════════════
-- PASO 10: Políticas para GROUP_MEMBERS
-- ═══════════════════════════════════════════
CREATE POLICY "Supervisors can view group members"
  ON group_members FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
        AND groups.supervisor_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all group members"
  ON group_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Workers can view own memberships"
  ON group_members FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Workers can join groups"
  ON group_members FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can add group members"
  ON group_members FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can remove group members"
  ON group_members FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Workers can leave groups"
  ON group_members FOR DELETE USING (user_id = auth.uid());

-- ═══════════════════════════════════════════
-- PASO 11: Trigger para auto-crear perfil al registrarse
-- ═══════════════════════════════════════════
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════
-- PASO 12: Crear perfiles para usuarios YA existentes
-- (si ya tienes usuarios registrados)
-- ═══════════════════════════════════════════
INSERT INTO profiles (id, role, full_name)
SELECT 
  u.id, 
  'worker',
  COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);

-- ═══════════════════════════════════════════
-- PASO 13: ¡HACERTE ADMIN!
-- Reemplaza el email con el tuyo
-- ═══════════════════════════════════════════
-- UPDATE profiles 
-- SET role = 'admin' 
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'aaronravines0504@gmail.com');
