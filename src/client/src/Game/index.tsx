import React, { useContext, useEffect, useState } from "react";
import { GameContext, socket } from "../App";
import { Game as GameDataType } from "../../../server/index";

import { Container } from "@mui/system";
import { Badge, Box, Button, Card, CardMedia, Chip, Grid, Typography } from "@mui/material";

import "./index.scss";

interface BoardSize {
	width: number;
	height: number;
}

interface Point {
	x: number;
	y: number;
}

function BoardCard({ size, position, value, className }: { size: BoardSize; position: Point; value: number; className?: string; }) {
	const game = useContext<GameDataType>(GameContext);
	const [ img, setImg ] = useState(value);
	const [ flipped, setFlipped ] = useState(false);

	useEffect(() => {
		setImg(value);
		if (value >= 0) setFlipped(true);
		
		socket.on(`ending-turn`, (state: number[]) => {
			if (state[ position.y * size.width + position.x ] < 0) setFlipped(false);
		});

		return () => {
			socket.off(`ending-turn`);
		}
	}, [ value ]);

	const handleClick = () => {
		socket.emit(`request-point`, game.id, position);
	};

	useEffect(() => {

		socket.on(`point-response`, (point: Point, img) => {
			if (point.x === position.x && point.y === position.y) {
				setImg(img);
				setFlipped(true);
			};
		});

		return () => {
			socket.off(`point-response`);
		};
	}, []);

	return <Card onClick={ handleClick } className={[
		"game-board-card",
		(flipped ? "--flipped" : ""),
		className ?? ""
	].join(" ")}>
		<CardMedia
			component="img"
			draggable="false"
			image={ img >= 0 ? `assets/cards/${img}.png` : `assets/cards/blank.png` }
		/>
		<div className="card-back"></div>
	</Card>;
}

function Board({ size, state, ended, isTurn }: { size: BoardSize; state: number[]; ended: boolean; isTurn: boolean; }) {
	const gap = ended ? 0.5 : 1;

	return <Grid className={[
		"game-board",
		(isTurn ? "--current-player" : "")
	].join(" ")} container direction="column" sx={{ padding: "2em" }} gap={ gap }>{ Array(size.height).fill(0).map(
		(_i, y) => <Grid container item key={ y } justifyContent="center" gap={ gap }>{ Array(size.width).fill(0).map(
			(_j, x) => <Grid item key={ x }>
				<BoardCard position={{ x, y }} size={ size } value={ state[ y * size.width + x ] } className={ ended ? "game-end" : "" } />
			</Grid>
		)}</Grid>
	)}</Grid>;
}

type LeaderBoard = Array<{
	id: string;
	score: string;
}>;

function Game() {
	const game = useContext<GameDataType>(GameContext);
	const [ size, setSize ] = useState<BoardSize>();
	const [ turnID, setTurnID ] = useState<string>();
	const [ solvedState, setSolvedState ] = useState<number[]>();
	const [ leaderboard, setLeaderboard ] = useState<LeaderBoard>();
	
	useEffect(() => {

		socket
			.emit(`client-ready`, game.id)
			.on(`game-turn`, (id: string, size: BoardSize, state: number[]) => {
				setTurnID(id);
				setSize(size);
				setSolvedState(state);
			})
			.on(`end-turn`, (state: number[]) => {
				const intermediate: number[] = [];
				state.forEach((el, i) => {
					if (el >= 0) intermediate[i] = el;
				});
				setSolvedState(intermediate);
				socket.emit(`client-ready`, game.id);
			})
			.on(`game-end`, (scores: LeaderBoard) => {
				setLeaderboard(scores);
			})

		return () => {
			socket.off(`game-turn`);
		};
	}, []);

	return <Container sx={{ padding: "2em" }}>
		<Box>
			<Typography sx={{ textDecoration: "underline" }}>SCORES</Typography>
			<Grid container justifyContent="space-between" sx={{ padding: "1em 2em" }}>{ Object.entries(game.scores).map(
				([ id, score ]) => <Grid item key={ id }>
					<Badge badgeContent={ score } showZero color="primary">
						<Chip color="primary" label={ (id === socket.id ? "(You) " : "") + id } sx={{ fontFamily: "monospace", borderRadius: "4px" }} variant={ id === turnID ? "filled" : "outlined" } />
					</Badge>
				</Grid>
			)}</Grid>
		</Box>
		{ size && solvedState && <Board size={ size } state={ solvedState } ended={ !!leaderboard } isTurn={ socket.id === turnID } />}
		{ leaderboard && <Container sx={{ display: "flex", justifyContent: "center" }}>
			<Button variant="contained" onClick={ () => socket.emit(`request-restart`, game.id) }>Play Again?</Button>
		</Container>}
	</Container>;
}

export default Game;