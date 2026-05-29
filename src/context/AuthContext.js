import { supabase } from "@utils/supabase";
import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
	const [session, setSession] = useState(null);
	const [user, setUser] = useState(null);
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		// İlk açılışta mevcut session'ı yükle
		supabase.auth.getSession().then(async ({ data: { session } }) => {
			setSession(session);

			if (session) {
				const { data, error } = await supabase.auth.getUser();

				if (error || !data?.user) {
					await supabase.auth.signOut();
					setSession(null);
					setUser(null);
				} else {
					setUser(data.user);
				}
			}

			setIsInitialized(true);
		});

		// Auth değişikliklerini dinle
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (_event, session) => {
			setSession(session);

			if (!session) {
				setUser(null);
				return;
			}

			const { data, error } = await supabase.auth.getUser();

			if (error || !data?.user) {
				await supabase.auth.signOut();
				setSession(null);
				setUser(null);
				return;
			}

			setUser(data.user);
		});

		return () => subscription.unsubscribe();
	}, []);

	const signOut = async () => {
		await supabase.auth.signOut();
	};

	return (
		<AuthContext.Provider value={{ session, user, isInitialized, signOut }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
	return context;
}
