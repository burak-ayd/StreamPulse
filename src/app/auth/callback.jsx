// src/app/auth/callback.jsx
import { supabase } from "@utils/supabase";
import { Redirect } from "expo-router";
import { useEffect } from "react";

export default function Callback() {
	useEffect(() => {
		supabase.auth.getSession().then(({ data }) => {
			console.log("session1:", data.session);
		});
	}, []);

	return <Redirect href="/" />;
}
