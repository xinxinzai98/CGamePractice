// Bullet.cpp: implementation of the CBullet class.
//
//////////////////////////////////////////////////////////////////////

#include "Bullet.h"

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CBullet::CBullet(const char* szname):CWeapon(szname)
{
    m_fBulletSpeed = 70;
}

CBullet::~CBullet()
{

}
void CBullet::OnMove(int iDir)
{
	SetDir(iDir);
	switch(GetDir())
		{
		case 2:
			SetSpeedX(0);
			SetSpeedY(-GetBulletSpeed());
			break;
		case 3:
			SetSpeedX(GetBulletSpeed());
			SetSpeedY(0);
			break;
		case 4:
			SetSpeedX(0);
			SetSpeedY(GetBulletSpeed());
			break;
		case 1:
			SetSpeedX(-GetBulletSpeed());
			SetSpeedY(0);
			break;
		}
	SetSpriteRotation(90*GetDir());
	SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
}
