import roomService from "./room";
import userService from "./user";
import authService from "./auth";
import gameService from "./game";

const services = {
  room: roomService,
  user: userService,
  auth: authService,
  game: gameService,
};

export default services;