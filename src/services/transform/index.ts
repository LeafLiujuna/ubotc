import * as mapper from "./mapper";
import * as formatter from "./formatter";

const transformService = {
  ...mapper,
  ...formatter,
};

export default transformService;