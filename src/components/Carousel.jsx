import { MOVIE_IMAGES } from "@constants/data";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
	Dimensions,
	ImageBackground,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Carousel from "react-native-snap-carousel";

const { width, height } = Dimensions.get("window");

const Carousel2 = ({}) => {
	const data = MOVIE_IMAGES;

	const handleClick = (item) => {
		console.log("Clicked", item);
	};

	return (
		<View style={styles.content}>
			<Carousel
				data={data}
				renderItem={({ item }) => (
					<MovieCard item={item} handleClick={handleClick} />
				)}
				firstItem={1}
				sliderWidth={width}
				itemWidth={width * 0.7}
				slideStyle={{ display: "flex", alignItems: "center" }}
			/>
		</View>
	);
};

export default Carousel2;

const MovieCard = ({ item, index, handleClick }) => (
	<Pressable onPress={() => handleClick(item)} key={index}>
		<ImageBackground source={{ uri: item.image }} style={styles.image}>
			<LinearGradient
				colors={["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.8)"]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.gradient}>
				<View style={styles.infoContainer}>
					<View style={styles.row}>
						<Text style={styles.title}>{item.name}</Text>
						<Text style={styles.genre}>{item.genre}</Text>
					</View>

					<View style={styles.row}>
						<MaterialIcons name="star" size={16} color="#FFD700" />
						<Text style={styles.rating}>{item.rating}</Text>
						<View style={styles.dot} />
						<Text style={styles.duration}>{item.duration}</Text>
					</View>
				</View>
			</LinearGradient>
		</ImageBackground>
	</Pressable>
);

const styles = StyleSheet.create({
	content: {
		marginBottom: 12,
	},
	image: {
		width: width * 0.7,
		height: height * 0.4,
		borderRadius: 24,
		overflow: "hidden",
	},
	gradient: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: "100%",
	},
	infoContainer: {
		justifyContent: "flex-end",
		padding: 20,
		height: "100%",
		width: "100%",
	},
	title: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
	},
	genre: {
		fontSize: 12,
		color: "#aaa",
		marginLeft: 6,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
	},
	rating: {
		fontSize: 12,
		color: "#FFD700",
		marginLeft: 6,
		marginRight: 6,
	},
	dot: {
		width: 4,
		height: 4,
		borderRadius: 2,
		backgroundColor: "#fff",
		marginHorizontal: 4,
	},
	duration: {
		fontSize: 12,
		color: "#fff",
	},
});
