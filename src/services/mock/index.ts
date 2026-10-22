import mockAuthService from "./auth";
import mockRoomService from "./room";
import mockGameService from "./game";
import mockUserService from "./user";

const mockServices = {
  auth: mockAuthService,
  room: mockRoomService,
  game: mockGameService,
  user: mockUserService,
};

export default mockServices;

export {
  mockAuthService,
  mockRoomService,
  mockGameService,
  mockUserService,
};