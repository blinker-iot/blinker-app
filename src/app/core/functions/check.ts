export function checkUsername(username) {
    if (username.length > 6) return true;
    return false;
}

export function checkPhone(phone) {
    if ((phone.length == 11) && (parseInt(phone) >= 10000000000)) return true;
    return false
}

export function checkSmscode(smscode) {
    if ((smscode.length == 6) && (parseInt(smscode) != NaN)) return true;
    return false;
}

export function checkPassword(password) {
    if (password.length > 7) return true;
    return false;
}