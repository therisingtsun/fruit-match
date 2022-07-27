export function getBoardSize(players: number) {
	switch (players) {
		default:
		case 1: return [ 4, 4 ];
		case 2: return [ 5, 4 ];
		case 3: return [ 6, 4 ];
		case 4: return [ 6, 5 ];
	}
}

export function shuffle(a: Array<any>) {
	let cur = a.length, r;

	while (cur != 0) {
		r = Math.floor(Math.random() * cur);
		cur--;

		[a[cur], a[r]] = [a[r], a[cur]];
	}

	return a;
}