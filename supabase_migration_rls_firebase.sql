-- Add Firebase RLS policies to allow authenticated users to manage their own gallery and projects

CREATE POLICY "users manage own gallery" ON public.galeria_multimedia
    FOR ALL TO authenticated
    USING (user_id = (auth.jwt()->>'sub'))
    WITH CHECK (user_id = (auth.jwt()->>'sub'));

CREATE POLICY "users manage own projects" ON public.proyectos_usuario
    FOR ALL TO authenticated
    USING (user_id = (auth.jwt()->>'sub'))
    WITH CHECK (user_id = (auth.jwt()->>'sub'));
