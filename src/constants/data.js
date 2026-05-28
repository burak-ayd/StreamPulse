const POPULAR_MOVIES = [
	{
		id: "1",
		title: "Interstellar",
		genre: "Bilim Kurgu / Drama",
		rating: "8.7",
		duration: "2sa 49dk",
		image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "2",
		title: "Inception",
		genre: "Aksiyon / Bilim Kurgu",
		rating: "8.8",
		duration: "2sa 28dk",
		image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "3",
		title: "The Dark Knight",
		genre: "Aksiyon / Suç",
		rating: "9.0",
		duration: "2sa 32dk",
		image: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "4",
		title: "Avatar: The Way of Water",
		genre: "Macera / Fantezi",
		rating: "7.6",
		duration: "3sa 12dk",
		image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=60",
	},
];

const RECOMMENDED_MOVIES = [
	{
		id: "5",
		title: "Dune: Part Two",
		genre: "Macera / Bilim Kurgu",
		rating: "8.9",
		duration: "2sa 46dk",
		image: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "6",
		title: "Oppenheimer",
		genre: "Biyografi / Drama",
		rating: "8.4",
		duration: "3sa",
		image: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "7",
		title: "Spider-Man: Across the Spider-Verse",
		genre: "Animasyon / Macera",
		rating: "8.6",
		duration: "2sa 20dk",
		image: "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=800&auto=format&fit=crop&q=60",
	},
];

const WATCH_HISTORY = [
	{
		id: "1",
		title: "Interstellar",
		image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&auto=format&fit=crop&q=60",
	},
	{
		id: "2",
		title: "Inception",
		image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&auto=format&fit=crop&q=60",
	},
	{
		id: "3",
		title: "The Dark Knight",
		image: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=400&auto=format&fit=crop&q=60",
	},
	{
		id: "4",
		title: "Avatar",
		image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&auto=format&fit=crop&q=60",
	},
	{
		id: "5",
		title: "Dune",
		image: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=400&auto=format&fit=crop&q=60",
	},
	{
		id: "6",
		title: "Oppenheimer",
		image: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400&auto=format&fit=crop&q=60",
	},
];

const CATEGORIES = [
	{ id: "1", name: "Action", icon: "local-fire-department" },
	{ id: "2", name: "Comedy", icon: "sentiment-very-satisfied" },
	{ id: "3", name: "Drama", icon: "theater-comedy" },
	{ id: "4", name: "Horror", icon: "sentiment-very-dissatisfied" },
	{ id: "5", name: "Sci-Fi", icon: "rocket-launch" },
	{ id: "6", name: "Romance", icon: "favorite" },
];

const FEATURED_MOVIES = [
	{
		id: "1",
		title: "Dune: Part Two",
		genres: ["Bilim Kurgu", "Macera"],
		rating: 8.5,
		duration: "2s 46d",
		description:
			"Paul Atreides, kendi kaderine ve evrenin geleceğine dair kehanetleri yerine getirmek için Fremenlerle birleşir.",
		poster: "https://image.tmdb.org/t/p/w780/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
		accentColor: "#C9A84C",
	},
	{
		id: "2",
		title: "Oppenheimer",
		genres: ["Biyografi", "Dram", "Tarih"],
		rating: 8.9,
		duration: "3s 0d",
		description:
			"Atom bombasının yaratıcısı J. Robert Oppenheimer'ın İkinci Dünya Savaşı sırasındaki yolculuğu.",
		poster: "https://image.tmdb.org/t/p/w780/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
		accentColor: "#E07B39",
	},
	{
		id: "3",
		title: "Poor Things",
		genres: ["Komedi", "Romantik", "Bilim Kurgu"],
		rating: 8.0,
		duration: "2s 21d",
		description:
			"Bir bilim insanı tarafından yeniden hayata döndürülen genç bir kadının inanılmaz maceraları.",
		poster: "https://image.tmdb.org/t/p/w600_and_h900_face/jzgOjZ71TcHqWHzUsWdTvvnisob.jpg",
		accentColor: "#A0C4A0",
	},
	{
		id: "4",
		title: "The Zone of Interest",
		genres: ["Dram", "Tarih", "Savaş"],
		rating: 7.4,
		duration: "1s 45d",
		description:
			"Bir Auschwitz komutanı ve eşinin, kampın duvarı yanı başında ideal bir hayat kurma çabaları.",
		poster: "https://image.tmdb.org/t/p/w600_and_h900_face/kXIpj0FUBUkZMZiR3bzK0vbEkUK.jpg",
		accentColor: "#8BAFC4",
	},
	{
		id: "5",
		title: "Anatomy of a Fall",
		genres: ["Gerilim", "Dram", "Suç"],
		rating: 7.8,
		duration: "2s 32d",
		description:
			"Kocasının ölümünün ardından yargılanan bir kadının mahkeme sürecini izleyen kışkırtıcı dram.",
		poster: "https://image.tmdb.org/t/p/w780/kQs6keheMwCxJxrzV83VUwFtHkB.jpg",
		accentColor: "#BFB0A0",
	},
];

export {
	CATEGORIES,
	FEATURED_MOVIES,
	POPULAR_MOVIES,
	RECOMMENDED_MOVIES,
	WATCH_HISTORY,
};
