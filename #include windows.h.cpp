#include <windows.h>
#include "MinHook.h"

// Con trỏ lưu địa chỉ của hàm MessageBoxW thật
typedef int (WINAPI *MESSAGEBOXW)(HWND, LPCWSTR, LPCWSTR, UINT);
MESSAGEBOXW fpMessageBoxW = NULL;

// Hàm giả mạo: Sẽ được gọi thay vì hàm thật
int WINAPI DetourMessageBoxW(HWND hWnd, LPCWSTR lpText, LPCWSTR lpCaption, UINT uType) {
    // Thay đổi nội dung gốc thành nội dung mới
    return fpMessageBoxW(hWnd, L"Nội dung đã bị Hook thay đổi!", L"Hook Thành Công", uType);
}