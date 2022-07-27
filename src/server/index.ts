import express from "express";
import { Server } from "http";
import { v4 as uuid } from "uuid";
import { BroadcastOperator, Server as IOServer, Socket } from "socket.io";
import { getBoardSize, shuffle } from "./utils";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { join } from "path";

const port = process.env.PORT || 8000;

const app = express();
app.use(express.static(join(__dirname, "public")));

const server = new Server(app);
server.listen(port);

const io: IOServer = new IOServer(server);
io.listen(server);

enum NotifVariant {
	Default = "default",
	Error = "error",
	Info = "info",
	Success = "success",
	Warning = "warning",
}

type Point = {
	x: number;
	y: number;
};

export interface Game {
	id: string;
	host: string;
	members: string[];
	scores: Record<string, number>;
	running: boolean;
}
interface GameState {
	board: number[];
	turn: number;
	requested: Point[];
	size: {
		width: number;
		height: number;
	}
	solved: number[];
	solvedState: number[];
}
const games: Record<string, Game> = {};
const gameStates: Record<string, GameState> = {};

const MaxMembers = 4;

const endTurn = (state: GameState, cast: BroadcastOperator<DefaultEventsMap, any>, delay: number = 1000) => {
	setTimeout(() => {
		cast.emit(`ending-turn`, state.solvedState);
		setTimeout(() => {
			state.requested = [];
			cast.emit(`end-turn`, state.solvedState);
		}, 250);
	}, delay);
};

const commitTurn = (client: Socket, id: string, { x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point) => {
	const game = games[id];
	const state = gameStates[id];
	if (game && state && client.id === game.members[state.turn]) {
		const { width } = state.size;
		
		const p1 = y1 * width + x1;
		const p2 = y2 * width + x2;

		const b1 = state.board[p1];
		const b2 = state.board[p2];
		
		const cast = io.to(id);

		if (b1 === b2 && !state.solved.includes(b1)) {
			state.solved.push(b1);
			state.solvedState[p1] = b1;
			state.solvedState[p2] = b2;
			game.scores[client.id]++;

			cast.emit(`turn-notif`, NotifVariant.Success, `Player ${client.id} scored!`);

			if (state.solved.length === state.board.length / 2) {
				const leaderboard = Object.entries(game.scores)
					.sort(([_1, a], [_2, b]) => b - a)
					.map(([ id, score ]) => {
						return { id, score };
					});
				game.running = false;
				cast.emit(`game-notif`, NotifVariant.Info, `Game has ended!`);
				cast.emit(`game-end`, leaderboard);
			} else {
				endTurn(state, cast, 0);
			}
			cast.emit(`game-data`, game);
		} else {
			state.turn = (state.turn + 1) % game.members.length;
			endTurn(state, cast);
		}
	}
};

io.on("connection", (client: Socket) => {
	const privateChannel = io.to(client.id);

	client
		.on("host-game", () => {
			const id = uuid().toUpperCase();
			games[id] = {
				id,
				host: client.id,
				members: [ client.id ],
				running: false,
				scores: {
					[client.id]: 0
				}
			};
			client.join(id);

			const cast = io.to(id);
			cast.emit(`game-notif`, NotifVariant.Success, `${client.id} has hosted a game!`);
			cast.emit(`game-data`, games[id]);
		})
		.on("join-game", (id: string) => {
			const game = games[id];
			if (!game) {
				privateChannel.emit(`game-notif`, NotifVariant.Error, `Could not find Game ${id}!`);
			} else if (game.running) {
				privateChannel.emit(`game-notif`, NotifVariant.Error, `Game ${id} has already started!`);
			} else if (game.members.length >= MaxMembers) {
				privateChannel.emit(`game-notif`, NotifVariant.Warning, `Game ${id} is full! Host a new Game or join another one.`);
			} else if (game.members.includes(client.id)) {
				privateChannel.emit(`game-notif`, NotifVariant.Error, `You're already in Game ${id}! How did you even pull that off…`);
			} else {
				game.members.push(client.id);
				game.scores[client.id] = 0;
				client.join(id);

				const cast = io.to(id);
				cast.emit(`game-notif`, NotifVariant.Success, `Player #${games[id].members.length} (${client.id}) has joined the game!`);
				cast.emit(`game-data`, game);
			}
		})
		.on("prepare-game", (id: string) => {
			const game = games[id];
			if (game && client.id === game.host) {
				const [ width, height ] = getBoardSize(game.members.length);
				const cards = width * height / 2;
				let board = [];
				for (let i = 0; i < cards; i++) {
					board.push(i, i);
				}
				board = shuffle(board);
				const state = {
					board,
					size: { width, height },
					turn: 0,
					requested: [],
					solved: [],
					solvedState: Array(board.length).fill(-1)
				};
				gameStates[id] = state;

				const cast = io.to(id);
				cast.emit(`game-notif`, NotifVariant.Info, `Starting game…`);
				cast.emit(`game-ready`);
			}
		})
		.on("client-ready", (id: string) => {
			const game = games[id];
			const state = gameStates[id];
			if (game && state) {
				const turnID = game.members[state.turn];
				if (!game.running) {
					privateChannel.emit(`game-notif`, NotifVariant.Success, `Game has started!`)
					game.running = true;
				}
				privateChannel.emit(`game-turn`, turnID, state.size, state.solvedState);
			}
		})
		.on("request-point", (id: string, { x, y }: Point) => {
			const game = games[id];
			const state = gameStates[id];
			if (game && state && client.id === game.members[state.turn]) {
				const { width } = state.size;
				const position = y * width + x;
				if (state.requested.length < 2 && state.solvedState[position] < 0) {
					const latest = state.requested[0];
					if (latest?.x !== x || latest?.y !== y) {
						state.requested.push({ x, y });
						io.to(id).emit(`point-response`, { x, y }, state.board[position]);
						if (state.requested.length === 2) {
							commitTurn(client, id, ...state.requested as [ Point, Point ]);
						}
					} 
				}
			}
		})
		.on("commit-turn", commitTurn)
		.on("request-restart", (id: string) => {
			if (games[id]) io.to(id).emit(`game-restart`);
		})
		.on("disconnecting", () => {
			for (const room of client.rooms) {
				if (room !== client.id) {
					const game = games[room];
					if (game) {
						const memberSet = new Set(game.members);
						memberSet.delete(client.id);
						game.members = [ ...memberSet ];
						delete game.scores[client.id];
						
						const cast = io.to(room);

						if (game.members.length === 0) {
							delete games[room];
						} else if (client.id === game.host) {
							game.host = game.members[0];
							cast.emit(`game-notif`, NotifVariant.Warning, `Host ${client.id} has left the game! ${game.host} is now the host!`);
							cast.emit(`game-data`, game);
						} else {
							cast.emit(`game-notif`, NotifVariant.Warning, `Player ${client.id} has left the game!`);
							cast.emit(`game-data`, game);
						}
					}
				}
			}
		})
});