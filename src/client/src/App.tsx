import React, { useContext, useEffect, useState, createContext } from "react";
import io from "socket.io-client";
import "./App.scss";
import { Game as GameDataType } from "../../server/index";
import { Box, Button, Container, Grid, List, ListItem, TextField, Typography } from "@mui/material";
import { SnackbarProvider, useSnackbar, VariantType } from "notistack";
import Game from "./Game";
import { getBoardSize } from "./utils";

export const socket = io();
export const GameContext = createContext<GameDataType>(null!);

function PreGame() {
	const game = useContext(GameContext);
	
	const [ inGame, setInGame ] = useState(false);
	const handleGameStart = () => {
		socket.emit(`prepare-game`, game.id);
	};

	useEffect(() => {
		socket
			.on(`game-ready`, () => {
				setInGame(true);
			})
			.on(`game-restart`, () => {
				setInGame(false);
			});
		
		return () => {
			socket
				.off(`game-ready`)
				.off(`game-restart`);
		};
	}, []);
	
	const [ width, height ] = getBoardSize(game.members.length);

	return inGame
		? 	<Game />
		: 	<Container sx={{ padding: "2rem" }}>
				<Typography>
					Share this Game ID with others so they can join this game: <code>{ game.id }</code>
				</Typography>
				<Grid container justifyContent="space-between">
					<Grid item>
						<Box sx={{ margin: "2em 0" }}>
							<Typography sx={{ textDecoration: "underline" }}>PLAYERS</Typography>
							<List>{ game.members.map(
								(m, i) => <ListItem key={ m }>
									<Typography><code>#{ i + 1 } { m } { m === game.host && `(Host)` } { m === socket.id && `(You)` }</code></Typography>
								</ListItem>
							)}</List>
						</Box>
					</Grid>
					<Grid item>
						<Typography sx={{ margin: "2em 0", textAlign: "right", }}>
							{ width } ✕ { height } Grid
						</Typography>
						{
							socket.id === game.host
							?	<Button variant="contained" onClick={ handleGameStart }>Start Game</Button>
							:	<Typography variant="button">Only the host can start the game</Typography>
						}
					</Grid>
				</Grid>
			</Container>;
}

function JoinGame() {
	const [ gameID, setGameID ] = useState("");
	const onGameIDChange = ({ target: { value } }: React.ChangeEvent<HTMLInputElement>) => {
		value = value.trim();
		setGameID(value);
	};
	
	const hostGame = () => {
		socket.emit(`host-game`);
	};

	const joinGame = () => {
		if (gameID) {
			socket.emit(`join-game`, gameID);
		}
	};

	return <Grid container justifyContent="space-evenly" alignItems="center" sx={{ height: "100vh" }}>
		<Grid item>
			<Button variant="contained" onClick={ hostGame }>Host Game</Button>
		</Grid>
		<Grid item sx={{
			display: "flex",
			alignItems: "flex-end",
			justifyContent: "space-evenly",
			gridGap: "0.5em",
		}}>
			<TextField
				variant="standard" autoComplete="off" label="Game ID"
				value={ gameID } onChange={ onGameIDChange } sx={{ width: "25em" }}
			/>
			<Button variant="contained" onClick={ joinGame }>Join Game</Button>
		</Grid>
	</Grid>;
}

function Main() {
	const [ game, setGame ] = useState<GameDataType | null>(null);
	const { enqueueSnackbar } = useSnackbar();

	useEffect(() => {
		socket
			.on(`game-data`, (data: GameDataType) => {
				setGame(data);
			})
			.on(`game-notif`, (variant: VariantType, notif: string) => {
				enqueueSnackbar(notif, {
					anchorOrigin: {
						vertical: "bottom",
						horizontal: "left"
					},
					style: {
						width: "70vw"
					},
					variant,
				});
			})
			.on(`turn-notif`, (variant: VariantType, notif: string) => {
				enqueueSnackbar(notif, {
					anchorOrigin: {
						vertical: "bottom",
						horizontal: "right"
					},
					variant,
				})
			});

		return () => {
			socket
				.off(`game-data`)
				.off(`game-notif`)
				.off(`turn-notif`);
		};
	}, []);

	return game
		? 	<GameContext.Provider value={ game }>
				<PreGame />
			</GameContext.Provider>
		: 	<JoinGame />
	;
}

function App() {

	return <SnackbarProvider style={{ fontFamily: "monospace" }} dense={ true }>
		<Main />
	</SnackbarProvider>;
}

export default App;
